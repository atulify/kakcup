use crate::{AppState, scoring};
use axum::{
    Json, Router,
    body::Bytes,
    extract::State,
    http::{HeaderMap, Method, StatusCode, Uri, header},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, put},
};
use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool};
use std::{
    borrow::Cow,
    collections::HashMap,
    sync::{Arc, LazyLock, Mutex},
};

const YEAR: &str = "jsonb_build_object('id',id,'year',year,'name',name,'status',status,'fishing_locked',fishing_locked,'chug_locked',chug_locked,'golf_locked',golf_locked)";
const TEAM: &str = "jsonb_build_object('id',id,'yearId',year_id,'name',name,'position',position,'kak1',kak1,'kak2',kak2,'kak3',kak3,'kak4',kak4,'kak1Id',kak_1,'kak2Id',kak_2,'kak3Id',kak_3,'kak4Id',kak_4,'locked',locked)";
const KAK: &str = "jsonb_build_object('id',id,'name',name,'status',status)";
const TIE: &str = "jsonb_build_object('id',id,'yearId',year_id,'teamId',team_id,'event',event,'deltaPoints',delta_points::text,'reason',reason,'createdBy',created_by,'createdAt',to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))";

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/years", get(handle).post(handle))
        .route("/api/years/{year}", get(handle).patch(handle))
        .route("/api/years/{year}/teams", get(handle).post(handle))
        .route("/api/teams/{team}", put(handle))
        .route("/api/years/{year}/fish-weights", get(handle).post(handle))
        .route("/api/years/{year}/chug-times", get(handle).post(handle))
        .route("/api/years/{year}/golf-scores", get(handle).post(handle))
        .route(
            "/api/years/{year}/teams/{team}/fish-weights",
            delete(handle),
        )
        .route("/api/years/{year}/teams/{team}/chug-times", delete(handle))
        .route("/api/years/{year}/teams/{team}/golf-scores", delete(handle))
        .route("/api/years/{year}/scores", delete(handle))
        .route(
            "/api/years/{year}/tie-breaks",
            get(handle).post(handle).delete(handle),
        )
        .route("/api/kaks", get(handle).post(handle))
        .route("/api/kaks/{kak}", patch(handle))
        .route("/api/kak-stats", get(handle))
        .route("/api/kak-results", get(handle))
}

fn err(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({"error":message}))).into_response()
}
fn ok(v: Value, status: StatusCode) -> Response {
    (status, Json(v)).into_response()
}
fn etag(body: String, headers: &HeaderMap, years: bool) -> Response {
    // Hash the actual UTF-8 representation, so old deployment tags cannot validate it accidentally.
    let mut hash = 0x811c9dc5u32;
    for b in body.bytes() {
        hash = (hash ^ u32::from(b)).wrapping_mul(0x01000193);
    }
    let tag = format!("\"rust-{hash:x}\"");
    let mut response = if headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        == Some(tag.as_str())
    {
        StatusCode::NOT_MODIFIED.into_response()
    } else {
        (
            [
                (header::CONTENT_TYPE, "application/json"),
                (header::ETAG, tag.as_str()),
            ],
            body,
        )
            .into_response()
    };
    if years {
        let value = "public, max-age=0, s-maxage=604800, stale-while-revalidate=86400";
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, value.parse().unwrap());
        response
            .headers_mut()
            .insert("cdn-cache-control", value.parse().unwrap());
    }
    response
}
// Serialize commands per Redis endpoint, keeping the newest Upstash sync token.
// A read that starts after an invalidation completes must carry that token.
async fn redis(state: &AppState, mut args: Value) -> Result<Value, ()> {
    static TOKENS: LazyLock<Mutex<HashMap<String, Arc<tokio::sync::Mutex<Option<String>>>>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));
    let (Some(url), Some(token)) = (&state.redis_url, &state.redis_token) else {
        return Ok(Value::Null);
    };
    if !state.cache_prefix.is_empty() {
        let key = args.get_mut(1).ok_or(())?;
        *key = Value::String(format!("{}{}", state.cache_prefix, key.as_str().ok_or(())?));
    }
    let sync = {
        let mut tokens = TOKENS.lock().map_err(|_| ())?;
        tokens
            .entry(url.clone())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(None)))
            .clone()
    };
    let mut sync_token = sync.lock().await;
    let mut request = state.http.post(url).bearer_auth(token).json(&args);
    if let Some(value) = sync_token.as_ref() {
        request = request.header("upstash-sync-token", value);
    }
    let response = request
        .send()
        .await
        .map_err(|_| ())?
        .error_for_status()
        .map_err(|_| ())?;
    if let Some(value) = response
        .headers()
        .get("upstash-sync-token")
        .and_then(|v| v.to_str().ok())
    {
        *sync_token = Some(value.to_owned());
    }
    let result: Value = response.json().await.map_err(|_| ())?;
    if result.get("error").is_some() {
        return Err(());
    }
    Ok(result.get("result").cloned().unwrap_or(Value::Null))
}
async fn invalidate(state: &AppState, keys: &[String]) -> Result<(), ()> {
    for key in keys {
        redis(state, json!(["DEL", key])).await?;
    }
    Ok(())
}
// Recognize a conservative subset of serde_json's canonical Value output without
// allocating a Value. Everything else uses the normal parser and serializer.
fn canonical_cache_body(body: &str) -> bool {
    struct Cursor<'a> {
        bytes: &'a [u8],
        pos: usize,
    }
    impl<'a> Cursor<'a> {
        fn take(&mut self, byte: u8) -> bool {
            if self.bytes.get(self.pos) == Some(&byte) {
                self.pos += 1;
                true
            } else {
                false
            }
        }
        fn string(&mut self) -> Option<&'a [u8]> {
            if !self.take(b'"') {
                return None;
            }
            let start = self.pos;
            while let Some(&byte) = self.bytes.get(self.pos) {
                match byte {
                    b'"' => {
                        let value = &self.bytes[start..self.pos];
                        self.pos += 1;
                        return Some(value);
                    }
                    b' '..=b'!' | b'#'..=b'[' | b']'..=b'~' => self.pos += 1,
                    _ => return None,
                }
            }
            None
        }
        fn value(&mut self, depth: usize) -> bool {
            if depth > 100 {
                return false;
            }
            match self.bytes.get(self.pos).copied() {
                Some(b'"') => self.string().is_some(),
                Some(b'[') => {
                    self.pos += 1;
                    if self.take(b']') {
                        return true;
                    }
                    loop {
                        if !self.value(depth + 1) {
                            return false;
                        }
                        if self.take(b']') {
                            return true;
                        }
                        if !self.take(b',') {
                            return false;
                        }
                    }
                }
                Some(b'{') => {
                    self.pos += 1;
                    if self.take(b'}') {
                        return true;
                    }
                    let mut previous: Option<&[u8]> = None;
                    loop {
                        let Some(key) = self.string() else {
                            return false;
                        };
                        if previous.is_some_and(|prev| prev >= key) || !self.take(b':') {
                            return false;
                        }
                        previous = Some(key);
                        if !self.value(depth + 1) {
                            return false;
                        }
                        if self.take(b'}') {
                            return true;
                        }
                        if !self.take(b',') {
                            return false;
                        }
                    }
                }
                Some(b't' | b'f' | b'n') => {
                    let rest = &self.bytes[self.pos..];
                    let word: &[u8] = if rest.starts_with(b"true") {
                        b"true"
                    } else if rest.starts_with(b"false") {
                        b"false"
                    } else if rest.starts_with(b"null") {
                        b"null"
                    } else {
                        return false;
                    };
                    self.pos += word.len();
                    true
                }
                Some(b'-' | b'0'..=b'9') => {
                    let start = self.pos;
                    let negative = self.take(b'-');
                    if self.take(b'0') {
                        if negative {
                            return false;
                        }
                    } else {
                        if !matches!(self.bytes.get(self.pos), Some(b'1'..=b'9')) {
                            return false;
                        }
                        self.pos += 1;
                        while matches!(self.bytes.get(self.pos), Some(b'0'..=b'9')) {
                            self.pos += 1;
                        }
                    }
                    let number = std::str::from_utf8(&self.bytes[start..self.pos]).unwrap();
                    if negative {
                        number.parse::<i64>().is_ok()
                    } else {
                        number.parse::<u64>().is_ok()
                    }
                }
                _ => false,
            }
        }
    }
    let mut cursor = Cursor { bytes: body.as_bytes(), pos: 0 };
    cursor.value(0) && cursor.pos == cursor.bytes.len()
}

fn cached_body(value: Value) -> Option<String> {
    let value = match value {
        Value::Null => return None,
        Value::String(s) => {
            if canonical_cache_body(&s) {
                return Some(s);
            }
            serde_json::from_str(&s).ok()?
        }
        value => value,
    };
    Some(serde_json::to_string(&value).unwrap_or_default())
}
async fn cache_get(state: &AppState, key: &str) -> Result<Option<String>, ()> {
    Ok(cached_body(redis(state, json!(["GET", key])).await?))
}
async fn cache_set(state: &AppState, key: &str, body: &str, ttl: i32) -> Result<(), ()> {
    redis(
        state,
        json!([
            "SET",
            key,
            body,
            "EX",
            ttl
        ]),
    )
    .await?;
    Ok(())
}
async fn many(db: &PgPool, sql: &str, arg: Option<&str>) -> Result<Value, sqlx::Error> {
    let mut q = sqlx::query_scalar::<_, Value>(sql);
    if let Some(a) = arg {
        q = q.bind(a);
    }
    Ok(Value::Array(q.fetch_all(db).await?))
}
async fn one(db: &PgPool, sql: &str, arg: &str) -> Result<Option<Value>, sqlx::Error> {
    sqlx::query_scalar::<_, Value>(sql)
        .bind(arg)
        .fetch_optional(db)
        .await
}
fn s<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}
fn num_string(v: &Value, key: &str) -> Option<String> {
    match v.get(key) {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(v) => Some(v.to_string()),
    }
}
fn unique(e: &sqlx::Error) -> bool {
    e.as_database_error().and_then(|e| e.code()).as_deref() == Some("23505")
}
async fn year(db: &PgPool, id: &str) -> Result<Option<Value>, sqlx::Error> {
    one(
        db,
        &format!("SELECT {YEAR} FROM years WHERE id::text=$1"),
        id,
    )
    .await
}

async fn standings(
    db: &PgPool,
    id: &str,
) -> Result<(Vec<Value>, Vec<f64>), sqlx::Error> {
    let teams = many(
        db,
        &format!("SELECT {TEAM} FROM teams WHERE year_id::text=$1"),
        Some(id),
    )
    .await?;
    let teams = match teams {
        Value::Array(teams) => teams,
        _ => Vec::new(),
    };
    let fish = many(db, "SELECT jsonb_build_object('teamId',team_id,'value',weight::text) FROM fish_weights WHERE year_id::text=$1", Some(id)).await?;
    let chug = many(db, "SELECT jsonb_build_object('teamId',team_id,'value',average::text) FROM chug_times WHERE year_id::text=$1", Some(id)).await?;
    let golf = many(db, "SELECT jsonb_build_object('teamId',team_id,'value',score) FROM golf_scores WHERE year_id::text=$1", Some(id)).await?;
    let mut fs: HashMap<&str, Vec<f64>> = HashMap::new();
    for row in fish.as_array().unwrap() {
        if let (Some(id), Some(v)) = (
            s(row, "teamId"),
            s(row, "value")
                .and_then(|v| v.parse::<f64>().ok())
                .filter(|v| !v.is_nan()),
        ) {
            fs.entry(id).or_default().push(v);
        }
    }
    let mut cs = HashMap::new();
    let mut gs = HashMap::new();
    for row in chug.as_array().unwrap() {
        if let (Some(id), Some(v)) = (
            s(row, "teamId"),
            s(row, "value")
                .and_then(|v| v.parse::<f64>().ok())
                .filter(|v| !v.is_nan()),
        ) {
            cs.insert(id, v);
        }
    }
    for row in golf.as_array().unwrap() {
        if let (Some(id), Some(v)) = (s(row, "teamId"), row["value"].as_f64()) {
            gs.insert(id, v);
        }
    }
    let complete: Vec<_> = teams
        .into_iter()
        .filter(|t| s(t, "id").is_some_and(|id| cs.contains_key(id) && gs.contains_key(id)))
        .collect();
    let mut f = HashMap::new();
    let mut c = HashMap::new();
    let mut g = HashMap::new();
    for team in &complete {
        let id = s(team, "id").unwrap();
        f.insert(
            id,
            scoring::calculate_top3_fish_total(fs.get(id).map(Vec::as_slice).unwrap_or(&[])),
        );
        c.insert(id, cs[id]);
        g.insert(id, gs[id]);
    }
    let fp = scoring::rank_teams(&f, true);
    let cp = scoring::rank_teams(&c, false);
    let gp = scoring::rank_teams(&g, false);
    let totals = complete
        .iter()
        .map(|t| {
            let id = s(t, "id").unwrap();
            fp.get(id).unwrap_or(&0.0)
                + cp.get(id).unwrap_or(&0.0)
                + gp.get(id).unwrap_or(&0.0)
        })
        .collect();
    Ok((complete, totals))
}
async fn store_results(db: &PgPool, id: &str) -> Result<(), sqlx::Error> {
    let (teams, points) = standings(db, id).await?;
    if teams.is_empty() {
        return Ok(());
    }
    let mut totals: HashMap<&str, f64> = teams
        .iter()
        .zip(points)
        .map(|(team, points)| (s(team, "id").unwrap(), points))
        .collect();
    let ties = many(
        db,
        &format!("SELECT {TIE} FROM tie_break_adjustments WHERE year_id::text=$1"),
        Some(id),
    )
    .await?;
    for row in ties.as_array().unwrap() {
        if let (Some(team), Some(delta)) = (
            s(row, "teamId"),
            s(row, "deltaPoints")
                .and_then(|v| v.parse::<f64>().ok())
                .filter(|v| v.is_finite()),
        ) {
            if let Some(v) = totals.get_mut(team) {
                *v += delta;
            }
        }
    }
    let max = totals.values().copied().fold(f64::NEG_INFINITY, f64::max);
    let min = totals.values().copied().fold(f64::INFINITY, f64::min);
    let tops = totals.values().filter(|v| **v == max).count();
    let mut tx = db.begin().await?;
    sqlx::query("DELETE FROM champs WHERE year_id::text=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM boots WHERE year_id::text=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    for team in &teams {
        let points = totals[s(team, "id").unwrap()];
        for key in ["kak1Id", "kak2Id", "kak3Id", "kak4Id"] {
            if let Some(kak) = s(team, key) {
                if tops == 1 && points == max {
                    sqlx::query("INSERT INTO champs(year_id,kak_id) VALUES ($1::uuid,$2::uuid) ON CONFLICT DO NOTHING").bind(id).bind(kak).execute(&mut *tx).await?;
                }
                if points == min {
                    sqlx::query("INSERT INTO boots(year_id,kak_id) VALUES ($1::uuid,$2::uuid) ON CONFLICT DO NOTHING").bind(id).bind(kak).execute(&mut *tx).await?;
                }
            }
        }
    }
    tx.commit().await
}

// Distinguish NaN (ID lookup) from a numeric value outside PostgreSQL's integer range.
fn parse_year(input: &str) -> Option<Option<i32>> {
    let input = input.trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    let (negative, rest) = match input.as_bytes().first() {
        Some(b'-') => (true, &input[1..]),
        Some(b'+') => (false, &input[1..]),
        _ => (false, input),
    };
    let (radix, digits) = if rest.starts_with("0x") || rest.starts_with("0X") {
        (16, &rest[2..])
    } else {
        (10, rest)
    };
    let digits: String = digits
        .chars()
        .take_while(|c| c.is_ascii_hexdigit() && (radix == 16 || c.is_ascii_digit()))
        .collect();
    if digits.is_empty() {
        return None;
    }
    let value = i64::from_str_radix(&digits, radix)
        .ok()
        .and_then(|n| if negative { n.checked_neg() } else { Some(n) })
        .and_then(|n| i32::try_from(n).ok());
    Some(value)
}

fn query_status(uri: &Uri) -> String {
    let mut url = reqwest::Url::parse("http://localhost/").expect("valid URL");
    url.set_query(uri.query());
    url.query_pairs()
        .find(|(key, _)| key == "status")
        .map(|(_, value)| value.into_owned())
        .unwrap_or_default()
}

fn decode_path_segment(segment: &str) -> Cow<'_, str> {
    let bytes = segment.as_bytes();
    if !bytes.contains(&b'%') {
        return Cow::Borrowed(segment);
    }
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(a), Some(b)) = (
                (bytes[i + 1] as char).to_digit(16),
                (bytes[i + 2] as char).to_digit(16),
            ) {
                decoded.push((a * 16 + b) as u8);
                i += 3;
                continue;
            }
        }
        decoded.push(bytes[i]);
        i += 1;
    }
    Cow::Owned(String::from_utf8_lossy(&decoded).into_owned())
}

async fn read_data(state: &AppState, path: &[&str], uri: &Uri, headers: &HeaderMap) -> Response {
    let db = &state.db;
    let status = query_status(uri);
    let (key, ttl, message) = match path {
        ["api", "years"] => ("years".to_string(), 3600, "Failed to fetch years"),
        ["api", "years", id] => (format!("year:{id}"), 3600, "Failed to fetch year"),
        ["api", "years", id, "teams"] => (format!("teams:{id}"), 3600, "Failed to fetch teams"),
        ["api", "years", id, "fish-weights"] => {
            (format!("fw:{id}"), 3600, "Failed to fetch fish weights")
        }
        ["api", "years", id, "chug-times"] => {
            (format!("ct:{id}"), 3600, "Failed to fetch chug times")
        }
        ["api", "years", id, "golf-scores"] => {
            (format!("gs:{id}"), 3600, "Failed to fetch golf scores")
        }
        ["api", "years", id, "tie-breaks"] => {
            (format!("tb:{id}"), 300, "Failed to fetch tie-breaks")
        }
        ["api", "kaks"] => {
            let status = &status;
            (
                if status.is_empty() {
                    "kaks".into()
                } else {
                    format!("kaks:{status}")
                },
                3600,
                "Failed to fetch KAKs",
            )
        }
        ["api", "kak-stats"] => ("kak-stats".into(), 300, "Failed to fetch KAK stats"),
        ["api", "kak-results"] => ("kak-results".into(), 300, "Failed to fetch KAK results"),
        _ => return err(StatusCode::NOT_FOUND, "Not found"),
    };
    if let ["api", "years", id, "tie-breaks"] = path {
        if !matches!(year(db, id).await, Ok(Some(_))) {
            return err(StatusCode::NOT_FOUND, "Year not found");
        }
    }
    match cache_get(state, &key).await {
        Ok(Some(body)) => return etag(body, headers, key == "years"),
        Err(()) => return err(StatusCode::INTERNAL_SERVER_ERROR, message),
        _ => {}
    }
    let result = match path {
        ["api","years"] => many(db,&format!("SELECT {YEAR} FROM years"),None).await,
        ["api","years",id] => {
            let value = match parse_year(id) {
                Some(Some(n)) => sqlx::query_scalar::<_,Value>(&format!("SELECT {YEAR} FROM years WHERE year=$1")).bind(n).fetch_optional(db).await,
                Some(None) => Ok(None),
                None => year(db,id).await,
            };
            value.map(|v| v.unwrap_or(Value::Null))
        }
        ["api","years",id,"teams"] => many(db,&format!("SELECT {TEAM} FROM teams WHERE year_id::text=$1"),Some(id)).await,
        ["api","years",id,"fish-weights"] => many(db,"SELECT jsonb_build_object('teamId',team_id,'weight',weight::text) FROM fish_weights WHERE year_id::text=$1",Some(id)).await,
        ["api","years",id,"chug-times"] => many(db,"SELECT jsonb_build_object('teamId',team_id,'chug1',chug_1::text,'chug2',chug_2::text,'average',average::text) FROM chug_times WHERE year_id::text=$1",Some(id)).await,
        ["api","years",id,"golf-scores"] => many(db,"SELECT jsonb_build_object('teamId',team_id,'score',score) FROM golf_scores WHERE year_id::text=$1",Some(id)).await,
        ["api","years",id,"tie-breaks"] => many(db,&format!("SELECT {TIE} FROM tie_break_adjustments WHERE year_id::text=$1"),Some(id)).await,
        ["api","kaks"] => {
            if status.is_empty() { many(db,&format!("SELECT {KAK} FROM kaks"),None).await } else { many(db,&format!("SELECT {KAK} FROM kaks WHERE status=$1"),Some(&status)).await }
        }
        ["api","kak-stats"] => sqlx::query_scalar::<_,Value>("SELECT jsonb_build_object('champs', COALESCE((SELECT jsonb_agg(row) FROM (SELECT jsonb_build_object('kakId',c.kak_id,'name',COALESCE(k.name,''),'total',count(*)) AS row FROM champs c LEFT JOIN kaks k ON k.id=c.kak_id GROUP BY c.kak_id,k.name ORDER BY count(*) DESC) s),'[]'::jsonb), 'boots',COALESCE((SELECT jsonb_agg(row) FROM (SELECT jsonb_build_object('kakId',b.kak_id,'name',COALESCE(k.name,''),'total',count(*)) AS row FROM boots b LEFT JOIN kaks k ON k.id=b.kak_id GROUP BY b.kak_id,k.name ORDER BY count(*) DESC) s),'[]'::jsonb))").fetch_one(db).await,
        ["api","kak-results"] => many(db,"SELECT jsonb_build_object('year',y.year,'champs',COALESCE((SELECT jsonb_agg(k.name ORDER BY k.name) FROM champs c JOIN kaks k ON k.id=c.kak_id WHERE c.year_id=y.id),'[]'::jsonb),'boots',COALESCE((SELECT jsonb_agg(k.name ORDER BY k.name) FROM boots b JOIN kaks k ON k.id=b.kak_id WHERE b.year_id=y.id),'[]'::jsonb)) FROM years y WHERE EXISTS (SELECT 1 FROM champs c JOIN kaks k ON k.id=c.kak_id WHERE c.year_id=y.id) OR EXISTS (SELECT 1 FROM boots b JOIN kaks k ON k.id=b.kak_id WHERE b.year_id=y.id) ORDER BY y.year DESC",None).await,
        _ => unreachable!(),
    };
    match result {
        Ok(value) => {
            let body = match serde_json::to_string(&value) {
                Ok(body) => body,
                Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR, message),
            };
            if cache_set(state, &key, &body, ttl).await.is_err() {
                return err(StatusCode::INTERNAL_SERVER_ERROR, message);
            }
            if value.is_null() {
                err(StatusCode::NOT_FOUND, "Year not found")
            } else {
                etag(body, headers, key == "years")
            }
        }
        Err(error) => {
            eprintln!("{message}: {error}");
            err(StatusCode::INTERNAL_SERVER_ERROR, message)
        }
    }
}

async fn handle(
    State(state): State<Arc<AppState>>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let segments: Vec<_> = uri
        .path()
        .trim_matches('/')
        .split('/')
        .map(decode_path_segment)
        .collect();
    let path: Vec<_> = segments.iter().map(Cow::as_ref).collect();
    if method == Method::GET || method == Method::HEAD {
        return read_data(&state, &path, &uri, &headers).await;
    }
    let claims = match crate::auth::authorize_admin(&headers, &state) {
        Ok(c) => c,
        Err(r) => return r,
    };
    let data: Value = if body.is_empty() {
        json!({})
    } else {
        match serde_json::from_slice(&body) {
            Ok(v) => v,
            Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR, "Invalid request body"),
        }
    };
    if method == Method::POST {
        if let ["api", "years", id, event @ ("fish-weights" | "chug-times" | "golf-scores")] = path.as_slice() {
            let all_values = headers.get_all("idempotency-key");
            let mut values = all_values.iter();
            if let Some(value) = values.next() {
                let key = match value.to_str() {
                    Ok(key) if !key.is_empty() && key.len() <= 200 && values.next().is_none() => key,
                    _ => return err(StatusCode::BAD_REQUEST, "Invalid Idempotency-Key"),
                };
                if headers.get("x-score-user").and_then(|value| value.to_str().ok()) != Some(claims.user_id.as_str()) {
                    return err(StatusCode::CONFLICT, "Score save belongs to a different account");
                }
                return idempotent_score(&state, id, event, &data, &claims.user_id, key).await;
            }
        }
    }
    mutate(&state, &method, &path, &data, &claims.user_id).await
}

fn valid_score(data: &Value, event: &str) -> bool {
    let valid_uuid = s(data, "teamId").is_some_and(|v| {
        v.len() == 36 && v.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) { b == b'-' } else { b.is_ascii_hexdigit() }
        })
    });
    valid_uuid
        && !data.get("notes").is_some_and(|v| !v.is_null() && !v.is_string())
        && !(event == "golf-scores" && data.get("score").is_some_and(|v| {
            !v.is_null() && v.as_i64().and_then(|n| i32::try_from(n).ok()).is_none()
        }))
}

async fn insert_score(
    conn: &mut PgConnection,
    id: &str,
    event: &str,
    data: &Value,
) -> Result<Option<Value>, sqlx::Error> {
    let team = s(data, "teamId").unwrap();
    let notes = s(data, "notes");
    match event {
        "fish-weights" => sqlx::query_scalar::<_,Value>("INSERT INTO fish_weights(year_id,team_id,weight,notes) VALUES ($1::uuid,$2::uuid,$3::numeric,$4) RETURNING jsonb_build_object('id',id,'yearId',year_id,'teamId',team_id,'weight',weight::text,'notes',notes)").bind(id).bind(team).bind(num_string(data,"weight")).bind(notes).fetch_optional(conn).await,
        "chug-times" => sqlx::query_scalar::<_,Value>("INSERT INTO chug_times(year_id,team_id,chug_1,chug_2,average,notes) VALUES ($1::uuid,$2::uuid,$3::numeric,$4::numeric,$5::numeric,$6) ON CONFLICT(year_id,team_id) DO UPDATE SET chug_1=CASE WHEN $7 THEN EXCLUDED.chug_1 ELSE chug_times.chug_1 END,chug_2=CASE WHEN $8 THEN EXCLUDED.chug_2 ELSE chug_times.chug_2 END,average=CASE WHEN $9 THEN EXCLUDED.average ELSE chug_times.average END,notes=CASE WHEN $10 THEN EXCLUDED.notes ELSE chug_times.notes END RETURNING jsonb_build_object('id',id,'yearId',year_id,'teamId',team_id,'chug1',chug_1::text,'chug2',chug_2::text,'average',average::text,'notes',notes)").bind(id).bind(team).bind(num_string(data,"chug1")).bind(num_string(data,"chug2")).bind(num_string(data,"average")).bind(notes).bind(data.get("chug1").is_some()).bind(data.get("chug2").is_some()).bind(data.get("average").is_some()).bind(data.get("notes").is_some()).fetch_optional(conn).await,
        _ => sqlx::query_scalar::<_,Value>("INSERT INTO golf_scores(year_id,team_id,score,notes) VALUES ($1::uuid,$2::uuid,$3,$4) ON CONFLICT(year_id,team_id) DO UPDATE SET score=CASE WHEN $5 THEN EXCLUDED.score ELSE golf_scores.score END,notes=CASE WHEN $6 THEN EXCLUDED.notes ELSE golf_scores.notes END RETURNING jsonb_build_object('id',id,'yearId',year_id,'teamId',team_id,'score',score,'notes',notes)").bind(id).bind(team).bind(data.get("score").and_then(Value::as_i64).map(|v| v as i32)).bind(notes).bind(data.get("score").is_some()).bind(data.get("notes").is_some()).fetch_optional(conn).await,
    }
}

async fn idempotent_score(
    state: &AppState,
    id: &str,
    event: &str,
    data: &Value,
    user_id: &str,
    key: &str,
) -> Response {
    let (cache, message, locked_field, locked_message) = match event {
        "fish-weights" => ("fw", "Failed to create fish weight", "fishing_locked", "Fishing competition is locked. No more weights can be added."),
        "chug-times" => ("ct", "Failed to create chug time", "chug_locked", "Chug competition is locked. No more times can be added."),
        _ => ("gs", "Failed to create golf score", "golf_locked", "Golf competition is locked. No more scores can be added."),
    };
    let path = format!("/api/years/{id}/{event}");
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR, message),
    };
    // The unique index waits for an in-flight transaction. If it rolls back,
    // this insert succeeds; if it commits, the next statement sees its result.
    let inserted = match sqlx::query("INSERT INTO score_idempotency(user_id,idempotency_key,request_path,request_body) VALUES ($1::uuid,$2,$3,$4) ON CONFLICT DO NOTHING")
        .bind(user_id).bind(key).bind(&path).bind(data).execute(&mut *tx).await {
        Ok(result) => result.rows_affected() == 1,
        Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR, message),
    };
    let value = if inserted {
        let year = match sqlx::query_scalar::<_, Value>(&format!("SELECT {YEAR} FROM years WHERE id::text=$1 FOR UPDATE"))
            .bind(id).fetch_optional(&mut *tx).await {
            Ok(Some(year)) => year,
            Ok(None) => return err(StatusCode::NOT_FOUND, "Year not found"),
            Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR, message),
        };
        if year.get(locked_field).and_then(Value::as_bool) == Some(true) {
            return err(StatusCode::FORBIDDEN, locked_message);
        }
        if !valid_score(data, event) {
            return err(StatusCode::BAD_REQUEST, "Invalid request body");
        }
        let value = match insert_score(&mut tx, id, event, data).await {
            Ok(Some(value)) => value,
            _ => return err(StatusCode::INTERNAL_SERVER_ERROR, message),
        };
        if sqlx::query("UPDATE score_idempotency SET response_body=$3 WHERE user_id=$1::uuid AND idempotency_key=$2")
            .bind(user_id).bind(key).bind(&value).execute(&mut *tx).await.is_err() {
            return err(StatusCode::INTERNAL_SERVER_ERROR, message);
        }
        value
    } else {
        let stored = sqlx::query_as::<_, (bool, bool, bool, Option<Value>)>("SELECT user_id=$1::uuid,request_path=$3,request_body=$4,response_body FROM score_idempotency WHERE idempotency_key=$2")
            .bind(user_id).bind(key).bind(&path).bind(data).fetch_optional(&mut *tx).await;
        match stored {
            Ok(Some((same_user, same_path, same_body, Some(value)))) => {
                if !same_user || !same_path || !same_body {
                    return err(StatusCode::CONFLICT, "Idempotency-Key already used for another request");
                }
                value
            }
            _ => return err(StatusCode::INTERNAL_SERVER_ERROR, message),
        }
    };
    if tx.commit().await.is_err() {
        return err(StatusCode::INTERNAL_SERVER_ERROR, message);
    }
    // Every replay performs the DEL again. In particular, a committed write
    // whose first DEL failed cannot be acknowledged before a successful DEL.
    if invalidate(state, &[format!("{cache}:{id}")]).await.is_err() {
        return err(StatusCode::INTERNAL_SERVER_ERROR, message);
    }
    ok(value, StatusCode::CREATED)
}

fn update_sql(
    table: &str,
    fields: &[(&str, &str, &str)],
    data: &Value,
    projection: &str,
) -> Option<String> {
    let sets: Vec<String> = fields
        .iter()
        .filter(|(key, _, _)| data.get(*key).is_some())
        .map(|(key, col, cast)| format!("{col}=($2->>'{key}'){cast}"))
        .collect();
    if sets.is_empty() {
        return None;
    }
    Some(format!(
        "UPDATE {table} SET {} WHERE id::text=$1 RETURNING {projection}",
        sets.join(",")
    ))
}
async fn mutate(
    state: &AppState,
    method: &Method,
    path: &[&str],
    data: &Value,
    user_id: &str,
) -> Response {
    let db = &state.db;
    let mut keys: Vec<String> = Vec::new();
    let mut status = StatusCode::OK;
    let message = match (method.as_str(), path) {
        ("POST", ["api", "years"]) => "Failed to create year",
        ("PATCH", ["api", "years", _]) => "Failed to update year",
        ("POST", ["api", "years", _, "teams"]) => "Failed to create team",
        ("PUT", ["api", "teams", _]) => "Failed to update team",
        ("POST", ["api", "years", _, "fish-weights"]) => "Failed to create fish weight",
        ("POST", ["api", "years", _, "chug-times"]) => "Failed to create chug time",
        ("POST", ["api", "years", _, "golf-scores"]) => "Failed to create golf score",
        ("DELETE", ["api", "years", _, "teams", _, "fish-weights"]) => {
            "Failed to delete fish weights"
        }
        ("DELETE", ["api", "years", _, "teams", _, "chug-times"]) => "Failed to delete chug time",
        ("DELETE", ["api", "years", _, "teams", _, "golf-scores"]) => "Failed to delete golf score",
        ("DELETE", ["api", "years", _, "scores"]) => "Failed to clear scores",
        ("POST", ["api", "years", _, "tie-breaks"]) => "Failed to apply tie-break",
        ("DELETE", ["api", "years", _, "tie-breaks"]) => "Failed to remove tie-break",
        ("POST", ["api", "kaks"]) => "Failed to create KAK",
        ("PATCH", ["api", "kaks", _]) => "Failed to update KAK",
        _ => return err(StatusCode::NOT_FOUND, "Not found"),
    };
    let guarded = match path {
        [
            "api",
            "years",
            id,
            "fish-weights" | "chug-times" | "golf-scores" | "scores" | "tie-breaks",
        ] => Some(*id),
        [
            "api",
            "years",
            id,
            "teams",
            _,
            "fish-weights" | "chug-times" | "golf-scores",
        ] => Some(*id),
        _ => None,
    };
    let current = if let Some(id) = guarded {
        match year(db, id).await {
            Ok(Some(v)) => Some(v),
            _ => return err(StatusCode::NOT_FOUND, "Year not found"),
        }
    } else {
        None
    };
    if let Some(y) = &current {
        let event = path.last().copied().unwrap_or("");
        let (field, msg) = match (event, method.as_str()) {
            ("fish-weights", "POST") => (
                "fishing_locked",
                "Fishing competition is locked. No more weights can be added.",
            ),
            ("fish-weights", "DELETE") => (
                "fishing_locked",
                "Fishing competition is locked. Cannot delete weights.",
            ),
            ("chug-times", "POST") => (
                "chug_locked",
                "Chug competition is locked. No more times can be added.",
            ),
            ("chug-times", "DELETE") => (
                "chug_locked",
                "Chug competition is locked. Cannot delete times.",
            ),
            ("golf-scores", "POST") => (
                "golf_locked",
                "Golf competition is locked. No more scores can be added.",
            ),
            ("golf-scores", "DELETE") => (
                "golf_locked",
                "Golf competition is locked. Cannot delete scores.",
            ),
            _ => ("", ""),
        };
        if y.get(field).and_then(Value::as_bool) == Some(true) {
            return err(StatusCode::FORBIDDEN, msg);
        }
    }
    let result: Result<Option<Value>, sqlx::Error> = match (method.as_str(), path) {
        ("POST", ["api", "years"]) => {
            let max = sqlx::query_scalar::<_, Option<i32>>("SELECT max(year) FROM years")
                .fetch_one(db)
                .await;
            match max {
                Ok(Some(n)) => {
                    status = StatusCode::CREATED;
                    sqlx::query_scalar::<_,Value>(&format!("INSERT INTO years(year,name,status) VALUES ($1,$2,'upcoming') RETURNING {YEAR}")).bind(n+1).bind(format!("{} KAK Cup",n+1)).fetch_optional(db).await
                }
                Ok(None) => return err(StatusCode::BAD_REQUEST, "No existing years found"),
                Err(e) => Err(e),
            }
        }
        ("PATCH", ["api", "years", id]) => {
            if s(data, "status") == Some("completed") {
                let y = match year(db, id).await {
                    Ok(Some(y)) => y,
                    _ => return err(StatusCode::NOT_FOUND, "Year not found"),
                };
                if !["fishing_locked", "chug_locked", "golf_locked"]
                    .iter()
                    .all(|k| {
                        data.get(*k)
                            .filter(|v| !v.is_null())
                            .unwrap_or(&y[*k])
                            .as_bool()
                            == Some(true)
                    })
                {
                    return err(
                        StatusCode::BAD_REQUEST,
                        "All three events must be locked before marking the year as completed.",
                    );
                }
            }
            let fields = [
                ("year", "year", "::integer"),
                ("name", "name", ""),
                ("status", "status", ""),
                ("fishing_locked", "fishing_locked", "::boolean"),
                ("chug_locked", "chug_locked", "::boolean"),
                ("golf_locked", "golf_locked", "::boolean"),
            ];
            match update_sql("years", &fields, data, YEAR) {
                Some(sql) => {
                    sqlx::query_scalar(&sql)
                        .bind(*id)
                        .bind(data)
                        .fetch_optional(db)
                        .await
                }
                None => year(db, id).await,
            }
        }
        ("POST", ["api", "years", id, "teams"]) => {
            status = StatusCode::CREATED;
            sqlx::query_scalar::<_,Value>(&format!("INSERT INTO teams(year_id,name,position,kak1,kak2,kak3,kak4,kak_1,kak_2,kak_3,kak_4,locked) VALUES ($1::uuid,$2->>'name',($2->>'position')::integer,$2->>'kak1',$2->>'kak2',$2->>'kak3',$2->>'kak4',($2->>'kak1Id')::uuid,($2->>'kak2Id')::uuid,($2->>'kak3Id')::uuid,($2->>'kak4Id')::uuid,COALESCE(($2->>'locked')::boolean,false)) RETURNING {TEAM}")).bind(*id).bind(data).fetch_optional(db).await
        }
        ("PUT", ["api", "teams", id]) => {
            let fields = [
                ("yearId", "year_id", "::uuid"),
                ("name", "name", ""),
                ("position", "position", "::integer"),
                ("kak1", "kak1", ""),
                ("kak2", "kak2", ""),
                ("kak3", "kak3", ""),
                ("kak4", "kak4", ""),
                ("kak1Id", "kak_1", "::uuid"),
                ("kak2Id", "kak_2", "::uuid"),
                ("kak3Id", "kak_3", "::uuid"),
                ("kak4Id", "kak_4", "::uuid"),
                ("locked", "locked", "::boolean"),
            ];
            match update_sql("teams", &fields, data, TEAM) {
                Some(sql) => {
                    sqlx::query_scalar(&sql)
                        .bind(*id)
                        .bind(data)
                        .fetch_optional(db)
                        .await
                }
                None => {
                    one(
                        db,
                        &format!("SELECT {TEAM} FROM teams WHERE id::text=$1"),
                        id,
                    )
                    .await
                }
            }
        }
        ("POST", ["api", "years", id, event @ ("fish-weights" | "chug-times" | "golf-scores")]) => {
            if !valid_score(data, event) {
                return err(StatusCode::BAD_REQUEST, "Invalid request body");
            }
            status = StatusCode::CREATED;
            match db.acquire().await {
                Ok(mut conn) => insert_score(&mut conn, id, event, data).await,
                Err(error) => Err(error),
            }
        }
        (
            "DELETE",
            [
                "api",
                "years",
                id,
                "teams",
                team,
                event @ ("fish-weights" | "chug-times" | "golf-scores"),
            ],
        ) => {
            let (table, key, msg) = match *event {
                "fish-weights" => ("fish_weights", "fw", "Fish weights deleted successfully"),
                "chug-times" => ("chug_times", "ct", "Chug time deleted successfully"),
                _ => ("golf_scores", "gs", "Golf score deleted successfully"),
            };
            keys.push(format!("{key}:{id}"));
            sqlx::query(&format!(
                "DELETE FROM {table} WHERE year_id::text=$1 AND team_id::text=$2"
            ))
            .bind(*id)
            .bind(*team)
            .execute(db)
            .await
            .map(|_| Some(json!({"message":msg})))
        }
        ("DELETE", ["api", "years", id, "scores"]) => {
            keys.extend([
                format!("fw:{id}"),
                format!("ct:{id}"),
                format!("gs:{id}"),
                "years".into(),
            ]);
            async {
                for table in ["fish_weights", "chug_times", "golf_scores"] {
                    sqlx::query(&format!("DELETE FROM {table} WHERE year_id::text=$1"))
                        .bind(*id)
                        .execute(db)
                        .await?;
                }
                Ok(Some(json!({"message":"All scores cleared for year"})))
            }
            .await
        }
        ("POST", ["api", "kaks"]) => {
            if s(data, "name").is_none_or(str::is_empty) {
                return err(StatusCode::BAD_REQUEST, "name is required");
            }
            status = StatusCode::CREATED;
            keys.extend(["kaks".into(), "kaks:active".into()]);
            sqlx::query_scalar::<_, Value>(&format!(
                "INSERT INTO kaks(name,status) VALUES ($1,COALESCE($2,'active')) RETURNING {KAK}"
            ))
            .bind(s(data, "name"))
            .bind(s(data, "status"))
            .fetch_optional(db)
            .await
        }
        ("PATCH", ["api", "kaks", id]) => {
            keys.extend(["kaks".into(), "kaks:active".into()]);
            match update_sql(
                "kaks",
                &[("name", "name", ""), ("status", "status", "")],
                data,
                KAK,
            ) {
                Some(sql) => {
                    sqlx::query_scalar(&sql)
                        .bind(*id)
                        .bind(data)
                        .fetch_optional(db)
                        .await
                }
                None => one(db, &format!("SELECT {KAK} FROM kaks WHERE id::text=$1"), id).await,
            }
        }
        ("POST", ["api", "years", id, "tie-breaks"]) => {
            let y = current.as_ref().unwrap();
            if s(y, "status") != Some("completed") {
                return err(
                    StatusCode::BAD_REQUEST,
                    "Year must be completed before applying a tie-break.",
                );
            }
            if !["fishing_locked", "chug_locked", "golf_locked"]
                .iter()
                .all(|k| y[*k].as_bool() == Some(true))
            {
                return err(
                    StatusCode::BAD_REQUEST,
                    "All events must be locked before applying a tie-break.",
                );
            }
            let team = match s(data, "teamId") {
                Some(v) if !v.is_empty() => v,
                _ => return err(StatusCode::BAD_REQUEST, "teamId is required"),
            };
            if s(data, "event") != Some("golf") {
                return err(
                    StatusCode::BAD_REQUEST,
                    "Only golf tie-breaks are supported right now.",
                );
            }
            let delta = match data.get("deltaPoints") {
                Some(Value::Number(n)) => n.as_f64(),
                Some(Value::String(s)) => s.parse::<f64>().ok(),
                _ => None,
            };
            if delta != Some(0.5) {
                return err(StatusCode::BAD_REQUEST, "deltaPoints must be 0.5");
            }
            let existing = match many(db,"SELECT jsonb_build_object('id',id) FROM tie_break_adjustments WHERE year_id::text=$1",Some(id)).await { Ok(v) => v, Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR,message) };
            if !existing.as_array().unwrap().is_empty() {
                return err(
                    StatusCode::CONFLICT,
                    "Tie-break already applied for this year.",
                );
            }
            let (teams, totals) = match standings(db, id).await {
                Ok(v) => v,
                Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR, message),
            };
            if teams.is_empty() {
                return err(StatusCode::BAD_REQUEST, "No completed teams to tie-break.");
            }
            let max = totals.iter().copied().fold(f64::NEG_INFINITY, f64::max);
            if totals.iter().filter(|&&points| points == max).count() < 2 {
                return err(StatusCode::BAD_REQUEST, "No tie for first place.");
            }
            if !teams.iter().zip(&totals).any(|(entry, &points)| {
                points == max && s(entry, "id") == Some(team)
            }) {
                return err(
                    StatusCode::BAD_REQUEST,
                    "teamId must be one of the tied teams.",
                );
            }
            status = StatusCode::CREATED;
            let reason = s(data, "reason").map(str::trim).filter(|s| !s.is_empty());
            let inserted = sqlx::query_scalar::<_,Value>(&format!("INSERT INTO tie_break_adjustments(year_id,team_id,event,delta_points,reason,created_by) VALUES ($1::uuid,$2::uuid,'golf',0.5,$3,$4::uuid) RETURNING {TIE}")).bind(*id).bind(team).bind(reason).bind(user_id).fetch_optional(db).await;
            if inserted.is_ok() {
                if store_results(db, id).await.is_err() {
                    return err(StatusCode::INTERNAL_SERVER_ERROR, message);
                }
                keys.extend([format!("tb:{id}"), "kak-stats".into(), "kak-results".into()]);
            }
            inserted
        }
        ("DELETE", ["api", "years", id, "tie-breaks"]) => {
            let deleted = sqlx::query("DELETE FROM tie_break_adjustments WHERE year_id::text=$1")
                .bind(*id)
                .execute(db)
                .await;
            match deleted {
                Err(e) => Err(e),
                Ok(_) => match store_results(db, id).await {
                    Err(e) => Err(e),
                    Ok(()) => {
                        keys.extend([format!("tb:{id}"), "kak-stats".into(), "kak-results".into()]);
                        Ok(Some(json!({"message":"Tie-break removed"})))
                    }
                },
            }
        }
        _ => unreachable!(),
    };
    let value = match result {
        Ok(Some(v)) => v,
        Ok(None) if matches!(path, ["api", "kaks", _]) => {
            return err(StatusCode::NOT_FOUND, "KAK not found");
        }
        Ok(None) => return err(StatusCode::INTERNAL_SERVER_ERROR, message),
        Err(e) if unique(&e) && matches!(path, ["api", "kaks", ..]) => {
            return err(StatusCode::CONFLICT, "A KAK with that name already exists");
        }
        Err(e) if unique(&e) && matches!(path, ["api", "years", _, "tie-breaks"]) => {
            return err(
                StatusCode::CONFLICT,
                "Tie-break already applied for this year.",
            );
        }
        Err(_) => return err(StatusCode::INTERNAL_SERVER_ERROR, message),
    };
    match (method.as_str(), path) {
        ("POST", ["api", "years"]) | ("PATCH", ["api", "years", _]) => {
            if method.as_str() == "PATCH" && s(&value, "status") == Some("completed") {
                if store_results(db, s(&value, "id").unwrap()).await.is_err() {
                    return err(StatusCode::INTERNAL_SERVER_ERROR, message);
                }
                keys.extend(["kak-stats".into(), "kak-results".into()]);
            }
            keys.extend([
                "years".into(),
                format!("year:{}", s(&value, "id").unwrap()),
                format!("year:{}", value["year"]),
            ]);
        }
        ("POST", ["api", "years", id, "teams"]) => keys.push(format!("teams:{id}")),
        ("PUT", ["api", "teams", _]) => {
            keys.push(format!("teams:{}", s(&value, "yearId").unwrap()))
        }
        ("POST", ["api", "years", id, event]) => match *event {
            "fish-weights" => keys.push(format!("fw:{id}")),
            "chug-times" => keys.push(format!("ct:{id}")),
            "golf-scores" => keys.push(format!("gs:{id}")),
            _ => {}
        },
        _ => {}
    }
    if invalidate(state, &keys).await.is_err() {
        return err(StatusCode::INTERNAL_SERVER_ERROR, message);
    }
    ok(value, status)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use sqlx::postgres::PgPoolOptions;

    fn state(redis_url: Option<String>) -> AppState {
        AppState {
            db: PgPoolOptions::new().connect_lazy("postgres://localhost/test").unwrap(),
            http: reqwest::Client::new(),
            redis_url,
            redis_token: Some("test".into()),
            cache_prefix: String::new(),
            jwt_secret: String::new(),
        }
    }

    #[test]
    fn year_uses_javascript_parse_int_rules() {
        assert_eq!(parse_year("  +2024suffix"), Some(Some(2024)));
        assert_eq!(parse_year("-0x10rest"), Some(Some(-16)));
        assert_eq!(parse_year("0x"), None);
        assert_eq!(parse_year("not-a-number"), None);
        assert_eq!(parse_year("99999999999999999999999999999"), Some(None));
        assert_eq!(
            parse_year("123e4567-e89b-12d3-a456-426614174000"),
            Some(Some(123))
        );
        assert_eq!(parse_year("-2147483648"), Some(Some(i32::MIN)));
    }

    #[test]
    fn status_and_path_decode_percent_encoding() {
        let uri = "/api/kaks?status=in%2Dmemoriam&status=active"
            .parse()
            .unwrap();
        assert_eq!(query_status(&uri), "in-memoriam");
        let uri = "/api/kaks?status=two+words".parse().unwrap();
        assert_eq!(query_status(&uri), "two words");
        assert_eq!(decode_path_segment("%20%2B2024"), " +2024");
        assert!(matches!(decode_path_segment("plain+text"), Cow::Borrowed("plain+text")));
        assert_eq!(decode_path_segment("%2F%25%2b"), "/%+");
        assert_eq!(decode_path_segment("%zz%2%"), "%zz%2%");
        assert_eq!(decode_path_segment("%FF%FEa"), "\u{fffd}\u{fffd}a");
        assert_eq!(decode_path_segment("%E2%82%AC"), "€");
        assert_eq!(decode_path_segment("%C3x"), "\u{fffd}x");
    }

    #[test]
    fn canonical_cache_fast_path_matches_serde() {
        let mut cases = vec![
            "null".to_owned(), "true".into(), "false".into(), "0".into(), "-0".into(),
            "00".into(), "-01".into(), "1.0".into(), "1e2".into(), "-1e-2".into(),
            i64::MIN.to_string(), (i64::MIN as i128 - 1).to_string(),
            u64::MAX.to_string(), (u64::MAX as u128 + 1).to_string(),
            r#""plain / string""#.into(), r#""\u0061""#.into(), r#""\n""#.into(),
            "\"é\"".into(), "\"\u{7f}\"".into(), "\"\u{01}\"".into(),
            r#"{"a":1,"b":2}"#.into(), r#"{"b":2,"a":1}"#.into(),
            r#"{"a":1,"a":2}"#.into(), r#"{"a":1,"aa":2}"#.into(),
            r#"{"aa":1,"a":2}"#.into(), r#"{"\u0061":1,"a":2}"#.into(),
            "[]".into(), "{}".into(), "[1,true,null]".into(), "[1,]".into(),
            r#"{"a":}"#.into(), "null ".into(), " null".into(), "truefalse".into(),
            "1e9999".into(), "\"unterminated".into(),
        ];
        for depth in [99, 100, 101, 127, 128, 129] {
            cases.push(format!("{}0{}", "[".repeat(depth), "]".repeat(depth)));
        }
        for input in cases {
            let expected = serde_json::from_str::<Value>(&input)
                .ok()
                .map(|value| serde_json::to_string(&value).unwrap_or_default());
            if canonical_cache_body(&input) {
                assert_eq!(expected.as_deref(), Some(input.as_str()), "{input:?}");
            }
            assert_eq!(cached_body(Value::String(input.clone())), expected, "{input:?}");
        }
    }

    #[tokio::test]
    async fn cached_values_preserve_canonical_body_and_etag() {
        let noncanonical = cached_body(json!(" { \"z\" : 2, \"a\": [1, 2] } ")).unwrap();
        let direct = cached_body(json!({"z": 2, "a": [1, 2]})).unwrap();
        assert_eq!(noncanonical, direct);
        assert_eq!(direct, r#"{"a":[1,2],"z":2}"#);
        assert_eq!(cached_body(json!("not json")), None);
        assert_eq!(cached_body(Value::Null), None);
        assert_eq!(cached_body(json!("null")).as_deref(), Some("null"));
        assert_eq!(cached_body(json!(false)).as_deref(), Some("false"));
        assert_eq!(cached_body(json!(42)).as_deref(), Some("42"));

        let response = etag(noncanonical, &HeaderMap::new(), true);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_TYPE], "application/json");
        assert_eq!(response.headers()[header::CACHE_CONTROL], "public, max-age=0, s-maxage=604800, stale-while-revalidate=86400");
        assert_eq!(response.headers()["cdn-cache-control"], response.headers()[header::CACHE_CONTROL]);
        let tag = response.headers()[header::ETAG].clone();
        assert_eq!(to_bytes(response.into_body(), usize::MAX).await.unwrap().as_ref(), direct.as_bytes());
        let mut headers = HeaderMap::new();
        headers.insert(header::IF_NONE_MATCH, tag);
        let response = etag(direct, &headers, true);
        assert_eq!(response.status(), StatusCode::NOT_MODIFIED);
        assert!(!response.headers().contains_key(header::ETAG));
        assert!(response.headers().contains_key(header::CACHE_CONTROL));
        assert!(to_bytes(response.into_body(), usize::MAX).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn cached_json_null_is_a_successful_response() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let router = Router::new().route("/", axum::routing::post(|| async {
            Json(json!({"result": "null"}))
        }));
        let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        let state = state(Some(url));
        let response = read_data(&state, &["api", "years"], &"/api/years".parse().unwrap(), &HeaderMap::new()).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers().contains_key(header::ETAG));
        assert_eq!(to_bytes(response.into_body(), usize::MAX).await.unwrap().as_ref(), b"null");
        server.abort();
    }

    #[tokio::test]
    async fn disabled_and_failed_cache_keep_existing_behavior() {
        let disabled = state(None);
        assert_eq!(cache_get(&disabled, "key").await, Ok(None));
        assert_eq!(cache_set(&disabled, "key", "null", 10).await, Ok(()));

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let router = Router::new().route("/", axum::routing::post(|| async {
            Json(json!({"error": "cache unavailable"}))
        }));
        let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        let failed = state(Some(url));
        assert_eq!(cache_get(&failed, "key").await, Err(()));
        assert_eq!(cache_set(&failed, "key", "null", 10).await, Err(()));
        let response = read_data(&failed, &["api", "years"], &"/api/years".parse().unwrap(), &HeaderMap::new()).await;
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(serde_json::from_slice::<Value>(&body).unwrap(), json!({"error": "Failed to fetch years"}));
        server.abort();
    }
}
