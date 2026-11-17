use axum::{
    Json, Router,
    body::Bytes,
    extract::{Request, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::Row;
use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::AppState;

const SESSION_SECONDS: usize = 7 * 24 * 60 * 60;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthClaims {
    #[serde(rename = "userId")]
    pub user_id: String,
    pub username: String,
    pub role: String,
    pub exp: usize,
}

fn error(status: StatusCode, key: &str, message: &str) -> Response {
    (status, Json(json!({ (key): message }))).into_response()
}

fn unauthorized() -> Response {
    error(StatusCode::UNAUTHORIZED, "error", "Unauthorized")
}

fn token_from_headers(headers: &HeaderMap) -> Option<&str> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|part| {
            let (name, value) = part.trim().split_once('=')?;
            (name.trim() == "token").then_some(value.trim())
        })
        .last()
        .filter(|token| !token.is_empty())
}

fn claims(headers: &HeaderMap, state: &AppState) -> Option<AuthClaims> {
    let token = token_from_headers(headers)?;
    let mut validation = Validation::new(Algorithm::HS256);
    validation.leeway = 0;
    decode::<AuthClaims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &validation,
    )
    .ok()
    .map(|data| data.claims)
}

/// Authorize an admin using the same JWT cookie as the existing API.
pub fn authorize_admin(headers: &HeaderMap, state: &AppState) -> Result<AuthClaims, Response> {
    let claims = claims(headers, state).ok_or_else(unauthorized)?;
    if claims.role != "admin" {
        return Err(error(
            StatusCode::FORBIDDEN,
            "error",
            "Admin access required",
        ));
    }
    Ok(claims)
}

/// Middleware alternative to `authorize_admin`; successful claims are in request extensions.
pub async fn require_admin(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Response {
    match authorize_admin(request.headers(), &state) {
        Ok(claims) => {
            request.extensions_mut().insert(claims);
            next.run(request).await
        }
        Err(response) => response,
    }
}

fn cookie(token: &str, max_age: usize) -> String {
    let secure = if std::env::var("NODE_ENV").as_deref() == Ok("production") {
        "Secure; "
    } else {
        ""
    };
    format!("token={token}; HttpOnly; {secure}SameSite=Strict; Path=/; Max-Age={max_age}")
}

fn with_cookie(body: Value, cookie: String) -> Response {
    let mut response = Json(body).into_response();
    // JWTs and the fixed cookie attributes are valid ASCII header values.
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        response.headers_mut().insert(header::SET_COOKIE, value);
    }
    response
}

async fn login(State(state): State<Arc<AppState>>, body: Bytes) -> Response {
    let body: Value = match serde_json::from_slice(if body.is_empty() { b"{}" } else { &body }) {
        Ok(value) => value,
        Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "message", "Server error"),
    };
    let Some(object) = body.as_object() else {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "message", "Server error");
    };
    let username = object.get("username");
    let password = object.get("password");
    let missing = |value: Option<&Value>| match value {
        None | Some(Value::Null) | Some(Value::Bool(false)) => true,
        Some(Value::String(s)) => s.is_empty(),
        Some(Value::Number(n)) => n.as_f64() == Some(0.0),
        _ => false,
    };
    if missing(username) || missing(password) {
        return error(
            StatusCode::BAD_REQUEST,
            "message",
            "Username and password required",
        );
    }
    let (Some(username), Some(password)) = (
        username.and_then(Value::as_str),
        password.and_then(Value::as_str),
    ) else {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "message", "Server error");
    };

    // Return UTC timestamps with millisecond precision.
    let result = sqlx::query(
        r#"SELECT id::text AS id, username, role, password_hash,
           json_build_object(
             'id', id::text, 'username', username, 'email', email,
             'firstName', first_name, 'lastName', last_name,
             'profileImageUrl', profile_image_url, 'role', role,
             'createdAt', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             'updatedAt', to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           )::text AS user_data
           FROM users WHERE username = $1 LIMIT 1"#,
    )
    .bind(username)
    .fetch_optional(&state.db)
    .await;
    let row = match result {
        Ok(Some(row)) => row,
        Ok(None) => return error(StatusCode::UNAUTHORIZED, "message", "Invalid credentials"),
        Err(err) => {
            eprintln!("Login error: {err}");
            return error(StatusCode::INTERNAL_SERVER_ERROR, "message", "Server error");
        }
    };
    let hash: Option<String> = row.get("password_hash");
    let Some(hash) = hash else {
        return error(StatusCode::UNAUTHORIZED, "message", "Invalid credentials");
    };
    // Keep CPU-intensive bcrypt verification off the async executor.
    let password = password.to_owned();
    match tokio::task::spawn_blocking(move || bcrypt::verify(password, &hash).unwrap_or(false))
        .await
    {
        Ok(true) => {}
        Ok(false) => {
            return error(StatusCode::UNAUTHORIZED, "message", "Invalid credentials");
        }
        Err(err) => {
            eprintln!("Login error: {err}");
            return error(StatusCode::INTERNAL_SERVER_ERROR, "message", "Server error");
        }
    }
    let exp = match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(now) => now.as_secs() as usize + SESSION_SECONDS,
        Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "message", "Server error"),
    };
    let claims = AuthClaims {
        user_id: row.get("id"),
        username: row.get::<Option<String>, _>("username").unwrap_or_default(),
        role: row.get("role"),
        exp,
    };
    let token = match encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    ) {
        Ok(token) => token,
        Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "message", "Server error"),
    };
    let data: String = row.get("user_data");
    match serde_json::from_str(&data) {
        Ok(data) => with_cookie(data, cookie(&token, SESSION_SECONDS)),
        Err(_) => error(StatusCode::INTERNAL_SERVER_ERROR, "message", "Server error"),
    }
}

async fn logout() -> Response {
    with_cookie(
        json!({ "message": "Logged out successfully" }),
        cookie("", 0),
    )
}

async fn user(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    match claims(&headers, &state) {
        Some(claims) => Json(json!({
            "id": claims.user_id,
            "username": claims.username,
            "role": claims.role,
        }))
        .into_response(),
        None => error(StatusCode::UNAUTHORIZED, "message", "Unauthorized"),
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/user", get(user))
}
