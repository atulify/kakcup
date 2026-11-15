use axum::Router;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;

pub mod auth;
pub mod data;
pub mod scoring;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub http: reqwest::Client,
    pub redis_url: Option<String>,
    pub redis_token: Option<String>,
    pub cache_prefix: String,
    pub jwt_secret: String,
}

impl AppState {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let database_url = std::env::var("DATABASE_URL")?;
        let db = PgPoolOptions::new()
            .max_connections(3)
            .connect_lazy(&database_url)?;
        let jwt_secret = std::env::var("JWT_SECRET")
            .or_else(|_| std::env::var("SESSION_SECRET"))
            .unwrap_or_else(|_| "dev-secret".to_owned());
        Ok(Self {
            db,
            http: reqwest::Client::new(),
            redis_url: std::env::var("UPSTASH_REDIS_REST_URL")
                .ok()
                .filter(|url| !url.is_empty()),
            redis_token: std::env::var("UPSTASH_REDIS_REST_TOKEN").ok(),
            cache_prefix: std::env::var("KAKCUP_CACHE_PREFIX").unwrap_or_default(),
            jwt_secret,
        })
    }
}

pub fn app(state: AppState) -> Router {
    Router::new()
        .merge(auth::router())
        .merge(data::router())
        .with_state(Arc::new(state))
}
