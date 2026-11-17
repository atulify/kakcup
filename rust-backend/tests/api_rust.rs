use axum::Router;
use kakcup_backend::{AppState, app};
use reqwest::{Client, Method, StatusCode};
use serde_json::{Value, json};
use sqlx::{PgPool, postgres::PgPoolOptions};
use std::time::{SystemTime, UNIX_EPOCH};

// The fixture lives in a unique schema, not the database's existing tables.
// TEST_DATABASE_URL must point to a disposable, non-production PostgreSQL database.
const SCHEMA: &str = r#"
CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text UNIQUE, email text UNIQUE, password_hash text, first_name text, last_name text, profile_image_url text, role text NOT NULL DEFAULT 'user', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE kaks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'active');
CREATE TABLE years (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), year integer NOT NULL UNIQUE, name text NOT NULL, status text NOT NULL DEFAULT 'upcoming', fishing_locked boolean NOT NULL DEFAULT false, chug_locked boolean NOT NULL DEFAULT false, golf_locked boolean NOT NULL DEFAULT false);
CREATE TABLE teams (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), year_id uuid NOT NULL, name text NOT NULL, position integer NOT NULL, kak1 text, kak2 text, kak3 text, kak4 text, kak_1 uuid REFERENCES kaks(id), kak_2 uuid REFERENCES kaks(id), kak_3 uuid REFERENCES kaks(id), kak_4 uuid REFERENCES kaks(id), locked boolean NOT NULL DEFAULT false);
CREATE INDEX teams_year_id_idx ON teams(year_id);
CREATE TABLE fish_weights (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), year_id uuid NOT NULL, team_id uuid NOT NULL, weight numeric(10,2), notes text);
CREATE INDEX fish_weights_year_team_idx ON fish_weights(year_id, team_id);
CREATE TABLE chug_times (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), year_id uuid NOT NULL, team_id uuid NOT NULL, chug_1 numeric(10,3), chug_2 numeric(10,3), average numeric(10,3), notes text, UNIQUE(year_id,team_id));
CREATE TABLE golf_scores (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), year_id uuid NOT NULL, team_id uuid NOT NULL, score integer, notes text, UNIQUE(year_id,team_id));
CREATE TABLE champs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), year_id uuid NOT NULL REFERENCES years(id), kak_id uuid NOT NULL REFERENCES kaks(id), UNIQUE(year_id,kak_id));
CREATE TABLE boots (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), year_id uuid NOT NULL REFERENCES years(id), kak_id uuid NOT NULL REFERENCES kaks(id), UNIQUE(year_id,kak_id));
CREATE TABLE tie_break_adjustments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), year_id uuid NOT NULL REFERENCES years(id), team_id uuid NOT NULL REFERENCES teams(id), event text NOT NULL, delta_points numeric(6,2) NOT NULL, reason text, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(year_id));
CREATE TABLE sessions (sid text PRIMARY KEY, sess text NOT NULL, expire timestamptz NOT NULL);
CREATE INDEX "IDX_session_expire" ON sessions(expire);
"#;

async fn request(
    client: &Client,
    base: &str,
    method: Method,
    path: &str,
    cookie: Option<&str>,
    body: Option<Value>,
) -> reqwest::Response {
    let mut request = client.request(method, format!("{base}{path}"));
    if let Some(cookie) = cookie {
        request = request.header("cookie", cookie);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }
    request.send().await.expect("HTTP request")
}

async fn ids(db: &PgPool, table: &str) -> Vec<String> {
    sqlx::query_scalar(&format!(
        "SELECT kak_id::text FROM {table} ORDER BY kak_id::text"
    ))
    .fetch_all(db)
    .await
    .expect("fetch results")
}

async fn uuid_predicate_contract(
    client: &Client,
    base: &str,
    cookie: &str,
    user_id: &str,
    year: &str,
    team: &str,
    kak: &str,
) {
    let nonmatching_ids = |id: &str| [
        "not-a-uuid".to_owned(),
        format!("{}g", &id[..35]),
        "ffffffff-ffff-ffff-ffff-ffffffffffff".to_owned(),
        id.to_ascii_uppercase(),
        id.replace('-', ""),
        format!("{{{id}}}"),
        format!("urn:uuid:{id}"),
        format!("{id}%20"),
    ];
    let year_path = format!("/api/years/{year}");
    let response = request(client, base, Method::GET, &year_path, None, None).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.json::<Value>().await.unwrap()["id"], year);

    // Both UPDATE and the no-fields SELECT fallback must preserve exact textual
    // identity, rather than accepting alternate spellings understood by UUID parsers.
    for (method, prefix, id, name, missing_status, message) in [
        (Method::PATCH, "/api/years", year, "Fixture", StatusCode::INTERNAL_SERVER_ERROR, "Failed to update year"),
        (Method::PUT, "/api/teams", team, "Alpha", StatusCode::INTERNAL_SERVER_ERROR, "Failed to update team"),
        (Method::PATCH, "/api/kaks", kak, "Fixture A", StatusCode::NOT_FOUND, "KAK not found"),
    ] {
        for invalid in nonmatching_ids(id) {
            for body in [json!({}), json!({"name":"Must not change"})] {
                let response = request(
                    client, base, method.clone(), &format!("{prefix}/{invalid}"),
                    Some(cookie), Some(body),
                ).await;
                assert_eq!(response.status(), missing_status, "{prefix}/{invalid}");
                assert_eq!(response.json::<Value>().await.unwrap()["error"], message);
            }
        }
        for body in [json!({}), json!({"name":name})] {
            let response = request(
                client, base, method.clone(), &format!("{prefix}/{id}"),
                Some(cookie), Some(body),
            ).await;
            assert_eq!(response.status(), StatusCode::OK);
            let value: Value = response.json().await.unwrap();
            assert_eq!(value["id"], id);
            assert_eq!(value["name"], name);
        }
    }

    for invalid in nonmatching_ids(year) {
        let path = format!("/api/years/{invalid}");
        for suffix in ["", "/tie-breaks"] {
            let response = request(client, base, Method::GET, &format!("{path}{suffix}"), None, None).await;
            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{path}{suffix}");
            assert_eq!(response.json::<Value>().await.unwrap()["error"], "Year not found");
        }
        for event in ["teams", "fish-weights", "chug-times", "golf-scores"] {
            let response = request(client, base, Method::GET, &format!("{path}/{event}"), None, None).await;
            assert_eq!(response.status(), StatusCode::OK, "{path}/{event}");
            assert_eq!(response.json::<Value>().await.unwrap(), json!([]));
        }
        for suffix in ["scores", "tie-breaks", "teams/not-a-uuid/fish-weights"] {
            let response = request(
                client, base, Method::DELETE, &format!("{path}/{suffix}"), Some(cookie), None,
            ).await;
            assert_eq!(response.status(), StatusCode::NOT_FOUND);
            assert_eq!(response.json::<Value>().await.unwrap()["error"], "Year not found");
        }
        let response = request(
            client, base, Method::PATCH, &path, Some(cookie), Some(json!({"status":"completed"})),
        ).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(response.json::<Value>().await.unwrap()["error"], "Year not found");

        // The idempotent path has its own SELECT ... FOR UPDATE predicate.
        for (index, event) in ["fish-weights", "chug-times", "golf-scores"].iter().enumerate() {
            let url = format!("{base}{path}/{event}");
            for idempotent in [false, true] {
                let mut pending = client.post(&url).header("cookie", cookie)
                    .json(&json!({"teamId":team,"weight":1,"average":5,"score":72}));
                if idempotent {
                    pending = pending
                        .header("Idempotency-Key", format!("uuid-contract-{index}-{invalid}"))
                        .header("x-score-user", user_id);
                }
                let response = pending.send().await.unwrap();
                assert_eq!(response.status(), StatusCode::NOT_FOUND, "{url}");
                assert_eq!(response.json::<Value>().await.unwrap()["error"], "Year not found");
            }
        }
    }

    // Keep real scores present while exercising both DELETE predicates: malformed
    // and noncanonical team IDs remain successful no-ops, never deleting the row.
    for (event, body, message) in [
        ("fish-weights", json!({"teamId":team,"weight":1}), "Fish weights deleted successfully"),
        ("chug-times", json!({"teamId":team,"average":5}), "Chug time deleted successfully"),
        ("golf-scores", json!({"teamId":team,"score":72}), "Golf score deleted successfully"),
    ] {
        let path = format!("{year_path}/{event}");
        let response = request(client, base, Method::POST, &path, Some(cookie), Some(body)).await;
        assert_eq!(response.status(), StatusCode::CREATED);
        let score: Value = response.json().await.unwrap();
        assert_eq!(score["yearId"], year);
        assert_eq!(score["teamId"], team);
        for invalid in nonmatching_ids(team) {
            let response = request(
                client, base, Method::DELETE,
                &format!("{year_path}/teams/{invalid}/{event}"), Some(cookie), None,
            ).await;
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(response.json::<Value>().await.unwrap(), json!({"message":message}));
        }
        let response = request(client, base, Method::GET, &path, None, None).await;
        assert_eq!(response.status(), StatusCode::OK);
        let rows: Value = response.json().await.unwrap();
        assert_eq!(rows.as_array().unwrap().len(), 1);
        assert_eq!(rows[0]["teamId"], team);
        let response = request(
            client, base, Method::DELETE,
            &format!("{year_path}/teams/{team}/{event}"), Some(cookie), None,
        ).await;
        assert_eq!(response.status(), StatusCode::OK);
        let response = request(client, base, Method::GET, &path, None, None).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.json::<Value>().await.unwrap(), json!([]));
    }
}

#[tokio::test]
async fn api_contract_against_isolated_postgres() {
    let url = std::env::var("TEST_DATABASE_URL")
        .expect("set TEST_DATABASE_URL to an isolated non-production PostgreSQL database");
    if let Ok(production_url) = std::env::var("DATABASE_URL") {
        assert_ne!(
            url, production_url,
            "TEST_DATABASE_URL must not be DATABASE_URL"
        );
    }
    let schema = format!(
        "kakcup_test_{}_{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let admin_db = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .expect("connect to test database");
    sqlx::query(&format!("CREATE SCHEMA \"{schema}\""))
        .execute(&admin_db)
        .await
        .expect("create isolated schema");
    let search_path = schema.clone();
    let db = PgPoolOptions::new()
        .max_connections(4)
        .after_connect(move |connection, _| {
            let search_path = search_path.clone();
            Box::pin(async move {
                sqlx::query("SELECT set_config('search_path', $1, false)")
                    .bind(search_path)
                    .execute(connection)
                    .await?;
                Ok(())
            })
        })
        .connect(&url)
        .await
        .expect("connect fixture pool");
    sqlx::raw_sql(SCHEMA)
        .execute(&db)
        .await
        .expect("create fixture schema");
    for _ in 0..2 {
        sqlx::raw_sql(include_str!("../../migrations/0001_score_idempotency.sql"))
            .execute(&db).await.expect("apply score idempotency migration");
    }

    // Exercise the actual operational seed in this isolated schema, including
    // partial rosters, conflicts, pre-existing statuses, and other years.
    sqlx::raw_sql(r#"
        INSERT INTO kaks(name,status) VALUES ('Pope','retired'), ('Outsider','active');
        INSERT INTO years(year,name) VALUES (2025,'2025'), (2024,'2024');
        INSERT INTO teams(year_id,name,position,kak1,kak_1)
          SELECT id,'Champs',1,'Original name',(SELECT id FROM kaks WHERE name='Pope')
          FROM years WHERE year=2025;
        INSERT INTO teams(year_id,name,position,kak_1)
          SELECT id,'Team 1',2,(SELECT id FROM kaks WHERE name='Outsider')
          FROM years WHERE year=2025;
        INSERT INTO teams(year_id,name,position)
          SELECT id,'Team 2',3 FROM years WHERE year=2025;
        INSERT INTO teams(year_id,name,position)
          SELECT y.id, roster.name, roster.position FROM years y
          CROSS JOIN (VALUES ('Team 3',4),('Team 4',5),('Team 5',6),('Team 6',7)) AS roster(name,position)
          WHERE y.year=2025;
        INSERT INTO teams(year_id,name,position)
          SELECT id,'Champs',1 FROM years WHERE year=2024;
    "#).execute(&db).await.unwrap();
    for _ in 0..2 {
        sqlx::raw_sql(include_str!("../seed-kaks.sql"))
            .execute(&db).await.expect("run seed SQL");
    }
    let statuses: Vec<(String, String)> = sqlx::query_as(
        "SELECT name,status FROM kaks WHERE name <> 'Outsider' ORDER BY name"
    ).fetch_all(&db).await.unwrap();
    assert_eq!(statuses.len(), 36);
    assert!(statuses.contains(&("Pope".into(), "retired".into())));
    assert!(statuses.contains(&("Draper".into(), "in-memoriam".into())));
    for name in ["Nate", "Needham", "Murray Kightly", "Snake", "Chateauvert", "Dave Draper", "Kittner"] {
        assert!(statuses.contains(&(name.into(), "retired".into())));
    }
    assert!(statuses.contains(&("Colster".into(), "active".into())));
    assert!(statuses.contains(&("Murray".into(), "active".into())));
    let roster: (String, Vec<String>) = sqlx::query_as(
        "SELECT t.kak1, ARRAY[k1.name,k2.name,k3.name,k4.name] FROM teams t \
         JOIN years y ON y.id=t.year_id JOIN kaks k1 ON k1.id=t.kak_1 \
         JOIN kaks k2 ON k2.id=t.kak_2 JOIN kaks k3 ON k3.id=t.kak_3 \
         JOIN kaks k4 ON k4.id=t.kak_4 WHERE y.year=2025 AND t.name='Champs'"
    ).fetch_one(&db).await.unwrap();
    assert_eq!(roster.0, "Original name");
    assert_eq!(roster.1, ["Pope", "Dump Bear", "Dyer", "Bopper"]);
    let untouched: (bool, bool) = sqlx::query_as(
        "SELECT k.name='Outsider', t.kak_2 IS NULL AND t.kak_3 IS NULL AND t.kak_4 IS NULL \
         FROM teams t JOIN years y ON y.id=t.year_id JOIN kaks k ON k.id=t.kak_1 \
         WHERE y.year=2025 AND t.name='Team 1'"
    ).fetch_one(&db).await.unwrap();
    assert_eq!(untouched, (true, true));
    let backfilled: Vec<String> = sqlx::query_scalar(
        "SELECT k.name FROM teams t JOIN years y ON y.id=t.year_id \
         JOIN kaks k ON k.id IN (t.kak_1,t.kak_2,t.kak_3,t.kak_4) \
         WHERE y.year=2025 AND t.name='Team 2' ORDER BY k.name"
    ).fetch_all(&db).await.unwrap();
    assert_eq!(backfilled, ["Body", "Boxy", "Muldoon", "Tank"]);
    let complete_rosters: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM teams t JOIN years y ON y.id=t.year_id \
         WHERE y.year=2025 AND t.kak_1 IS NOT NULL AND t.kak_2 IS NOT NULL \
         AND t.kak_3 IS NOT NULL AND t.kak_4 IS NOT NULL"
    ).fetch_one(&db).await.unwrap();
    assert_eq!(complete_rosters, 6);
    let other_year_untouched: bool = sqlx::query_scalar(
        "SELECT t.kak_1 IS NULL AND t.kak_2 IS NULL AND t.kak_3 IS NULL AND t.kak_4 IS NULL \
         FROM teams t JOIN years y ON y.id=t.year_id WHERE y.year=2024"
    ).fetch_one(&db).await.unwrap();
    assert!(other_year_untouched);
    sqlx::raw_sql("TRUNCATE teams, years, kaks CASCADE")
        .execute(&db).await.unwrap();

    let password_hash = bcrypt::hash("test-password", 4).unwrap();
    sqlx::query("INSERT INTO users(username,password_hash,role) VALUES ('fixture-admin',$1,'admin'),('fixture-user',$1,'user')")
        .bind(password_hash).execute(&db).await.unwrap();
    let year: String = sqlx::query_scalar(
        "INSERT INTO years(id,year,name,status) VALUES ('a0000000-0000-4000-8000-000000000001',2099,'Fixture','active') RETURNING id::text",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    let kak_a: String =
        sqlx::query_scalar("INSERT INTO kaks(id,name) VALUES ('c0000000-0000-4000-8000-000000000001','Fixture A') RETURNING id::text")
            .fetch_one(&db)
            .await
            .unwrap();
    let kak_b: String =
        sqlx::query_scalar("INSERT INTO kaks(name) VALUES ('Fixture B') RETURNING id::text")
            .fetch_one(&db)
            .await
            .unwrap();
    let team_a: String = sqlx::query_scalar("INSERT INTO teams(id,year_id,name,position,kak_1) VALUES ('b0000000-0000-4000-8000-000000000001',$1::uuid,'Alpha',1,$2::uuid) RETURNING id::text").bind(&year).bind(&kak_a).fetch_one(&db).await.unwrap();
    let team_b: String = sqlx::query_scalar("INSERT INTO teams(year_id,name,position,kak_1) VALUES ($1::uuid,'Beta',2,$2::uuid) RETURNING id::text").bind(&year).bind(&kak_b).fetch_one(&db).await.unwrap();
    // Incomplete teams must not participate even when they have fish.
    let team_c: String = sqlx::query_scalar("INSERT INTO teams(year_id,name,position) VALUES ($1::uuid,'Incomplete',3) RETURNING id::text").bind(&year).fetch_one(&db).await.unwrap();

    let state = AppState {
        db: db.clone(),
        http: Client::new(),
        redis_url: None,
        redis_token: None,
        cache_prefix: String::new(),
        jwt_secret: "fixture-only-secret".into(),
    };
    let router: Router = app(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    let client = Client::new();
    let year_path = format!("/api/years/{year}");
    let teams_path = format!("{year_path}/teams");

    let years = request(&client, &base, Method::GET, "/api/years", None, None).await;
    assert_eq!(years.status(), StatusCode::OK);
    let etag = years
        .headers()
        .get("etag")
        .unwrap()
        .to_str()
        .unwrap()
        .to_owned();
    let years: Value = years.json().await.unwrap();
    assert!(years.as_array().unwrap().iter().any(|y| y["id"] == year));
    let conditional = client
        .get(format!("{base}/api/years"))
        .header("if-none-match", etag)
        .send()
        .await
        .unwrap();
    assert_eq!(conditional.status(), StatusCode::NOT_MODIFIED);
    let teams = request(&client, &base, Method::GET, &teams_path, None, None).await;
    assert_eq!(teams.status(), StatusCode::OK);
    assert_eq!(
        teams
            .json::<Value>()
            .await
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        request(
            &client,
            &base,
            Method::PATCH,
            &year_path,
            None,
            Some(json!({"status":"completed"}))
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(
            &client,
            &base,
            Method::POST,
            "/api/auth/login",
            None,
            Some(json!({"username":"fixture-admin","password":"incorrect"}))
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );

    let login = request(
        &client,
        &base,
        Method::POST,
        "/api/auth/login",
        None,
        Some(json!({"username":"fixture-admin","password":"test-password"})),
    )
    .await;
    assert_eq!(login.status(), StatusCode::OK);
    let cookie = login
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let logged_in: Value = login.json().await.unwrap();
    assert_eq!(logged_in["role"], "admin");
    assert!(logged_in.get("passwordHash").is_none());
    assert_eq!(
        request(
            &client,
            &base,
            Method::GET,
            "/api/auth/user",
            Some(&cookie),
            None
        )
        .await
        .status(),
        StatusCode::OK
    );
    let user_login = request(
        &client,
        &base,
        Method::POST,
        "/api/auth/login",
        None,
        Some(json!({"username":"fixture-user","password":"test-password"})),
    )
    .await;
    let user_cookie = user_login
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    assert_eq!(
        request(
            &client,
            &base,
            Method::PATCH,
            &year_path,
            Some(&user_cookie),
            Some(json!({"status":"completed"}))
        )
        .await
        .status(),
        StatusCode::FORBIDDEN
    );

    // A token produced independently of the login endpoint uses the same HS256
    // cookie contract as the existing JavaScript API.
    let admin_id: String =
        sqlx::query_scalar("SELECT id::text FROM users WHERE username='fixture-admin'")
            .fetch_one(&db)
            .await
            .unwrap();
    uuid_predicate_contract(&client, &base, &cookie, &admin_id, &year, &team_a, &kak_a).await;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let sign = |exp, secret: &str| {
        jsonwebtoken::encode(
            &jsonwebtoken::Header::default(),
            &json!({"userId":admin_id,"username":"fixture-admin","role":"admin","exp":exp}),
            &jsonwebtoken::EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap()
    };
    let interop_cookie = format!(
        "other=value; token={}",
        sign(now + 3600, "fixture-only-secret")
    );
    let me = request(
        &client,
        &base,
        Method::GET,
        "/api/auth/user",
        Some(&interop_cookie),
        None,
    )
    .await;
    assert_eq!(me.status(), StatusCode::OK);
    assert_eq!(
        me.json::<Value>().await.unwrap(),
        json!({"id":admin_id,"username":"fixture-admin","role":"admin"})
    );
    for bad_cookie in [
        format!("token={}", sign(now - 60, "fixture-only-secret")),
        format!("token={}", sign(now + 3600, "wrong-secret")),
        "token=not-a-jwt".to_owned(),
    ] {
        assert_eq!(
            request(
                &client,
                &base,
                Method::GET,
                "/api/auth/user",
                Some(&bad_cookie),
                None
            )
            .await
            .status(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            request(
                &client,
                &base,
                Method::POST,
                "/api/kaks",
                Some(&bad_cookie),
                Some(json!({"name":"Denied"}))
            )
            .await
            .status(),
            StatusCode::UNAUTHORIZED
        );
    }
    let missing_login = request(
        &client,
        &base,
        Method::POST,
        "/api/auth/login",
        None,
        Some(json!({"username":"fixture-admin"})),
    )
    .await;
    assert_eq!(missing_login.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        missing_login.json::<Value>().await.unwrap()["message"],
        "Username and password required"
    );

    let numeric_year = request(&client, &base, Method::GET, "/api/years/2099", None, None).await;
    assert_eq!(numeric_year.status(), StatusCode::OK);
    assert_eq!(numeric_year.json::<Value>().await.unwrap()["id"], year);
    let absent = request(&client, &base, Method::GET, "/api/years/1900", None, None).await;
    assert_eq!(absent.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        absent.json::<Value>().await.unwrap()["error"],
        "Year not found"
    );
    let missing_tie = request(
        &client,
        &base,
        Method::GET,
        "/api/years/missing/tie-breaks",
        None,
        None,
    )
    .await;
    assert_eq!(missing_tie.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        missing_tie.json::<Value>().await.unwrap()["error"],
        "Year not found"
    );

    let no_name = request(
        &client,
        &base,
        Method::POST,
        "/api/kaks",
        Some(&interop_cookie),
        Some(json!({})),
    )
    .await;
    assert_eq!(no_name.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        no_name.json::<Value>().await.unwrap()["error"],
        "name is required"
    );
    let created_kak = request(
        &client,
        &base,
        Method::POST,
        "/api/kaks",
        Some(&interop_cookie),
        Some(json!({"name":"Fixture C"})),
    )
    .await;
    assert_eq!(created_kak.status(), StatusCode::CREATED);
    let created_kak: Value = created_kak.json().await.unwrap();
    assert_eq!(created_kak["status"], "active");
    let kak_c = created_kak["id"].as_str().unwrap();
    let duplicate = request(
        &client,
        &base,
        Method::POST,
        "/api/kaks",
        Some(&cookie),
        Some(json!({"name":"Fixture C"})),
    )
    .await;
    assert_eq!(duplicate.status(), StatusCode::CONFLICT);
    assert_eq!(
        duplicate.json::<Value>().await.unwrap()["error"],
        "A KAK with that name already exists"
    );
    let duplicate_rename = request(
        &client, &base, Method::PATCH, &format!("/api/kaks/{kak_a}"),
        Some(&cookie), Some(json!({"name":"Fixture C"})),
    ).await;
    assert_eq!(duplicate_rename.status(), StatusCode::CONFLICT);
    let active: Value = request(&client, &base, Method::GET, "/api/kaks?status=active", None, None)
        .await.json().await.unwrap();
    assert!(active.as_array().unwrap().iter().any(|k| k["id"] == kak_a && k["name"] == "Fixture A"));
    for status in ["inactive", "retired"] {
        let response = request(
            &client, &base, Method::PATCH, &format!("/api/kaks/{kak_c}"),
            Some(&cookie), Some(json!({"status":status})),
        ).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.json::<Value>().await.unwrap()["status"], status);
        let filtered: Value = request(&client, &base, Method::GET, &format!("/api/kaks?status={status}"), None, None)
            .await.json().await.unwrap();
        assert_eq!(filtered.as_array().unwrap().len(), 1);
        assert_eq!(filtered[0]["id"], kak_c);
    }

    let kak_path = format!("/api/kaks/{kak_c}");
    let updated = request(
        &client,
        &base,
        Method::PATCH,
        &kak_path,
        Some(&cookie),
        Some(json!({"name":"Fixture C renamed","status":"in-memoriam"})),
    )
    .await;
    assert_eq!(updated.status(), StatusCode::OK);
    assert_eq!(
        updated.json::<Value>().await.unwrap()["name"],
        "Fixture C renamed"
    );
    let filtered = request(
        &client,
        &base,
        Method::GET,
        "/api/kaks?status=in%2Dmemoriam",
        None,
        None,
    )
    .await;
    assert_eq!(filtered.status(), StatusCode::OK);
    let filtered: Value = filtered.json().await.unwrap();
    assert_eq!(filtered.as_array().unwrap().len(), 1);
    assert_eq!(filtered[0]["id"], kak_c);
    assert_eq!(filtered[0]["name"], "Fixture C renamed");
    assert_eq!(filtered[0]["status"], "in-memoriam");
    let inactive: Value = request(&client, &base, Method::GET, "/api/kaks?status=inactive", None, None)
        .await.json().await.unwrap();
    assert!(inactive.as_array().unwrap().is_empty());
    assert_eq!(
        request(
            &client,
            &base,
            Method::PATCH,
            "/api/kaks/missing",
            Some(&cookie),
            Some(json!({"name":"Missing"}))
        )
        .await
        .status(),
        StatusCode::NOT_FOUND
    );

    let created_team = request(
        &client,
        &base,
        Method::POST,
        &teams_path,
        Some(&cookie),
        Some(json!({"name":"Gamma","position":4,"kak1Id":kak_c})),
    )
    .await;
    assert_eq!(created_team.status(), StatusCode::CREATED);
    let created_team: Value = created_team.json().await.unwrap();
    assert_eq!(created_team["yearId"], year);
    assert_eq!(created_team["kak1Id"], kak_c);
    assert!(created_team["kak2Id"].is_null());
    assert!(created_team["kak3Id"].is_null());
    assert!(created_team["kak4Id"].is_null());
    let team_d = created_team["id"].as_str().unwrap();
    let updated_team = request(
        &client,
        &base,
        Method::PUT,
        &format!("/api/teams/{team_d}"),
        Some(&cookie),
        Some(json!({"name":"Gamma updated","locked":true,"kak2Id":kak_b})),
    )
    .await;
    assert_eq!(updated_team.status(), StatusCode::OK);
    let updated_team: Value = updated_team.json().await.unwrap();
    assert_eq!(updated_team["name"], "Gamma updated");
    assert_eq!(updated_team["position"], 4);
    assert_eq!(updated_team["locked"], true);
    assert_eq!(updated_team["kak1Id"], kak_c);
    assert_eq!(updated_team["kak2Id"], kak_b);
    assert!(updated_team["kak3Id"].is_null());
    assert!(updated_team["kak4Id"].is_null());
    let teams: Value = request(&client, &base, Method::GET, &teams_path, None, None)
        .await.json().await.unwrap();
    let persisted_team = teams.as_array().unwrap().iter().find(|team| team["id"] == team_d).unwrap();
    assert_eq!(persisted_team["kak1Id"], kak_c);
    assert_eq!(persisted_team["kak2Id"], kak_b);
    assert!(persisted_team["kak3Id"].is_null());
    assert!(persisted_team["kak4Id"].is_null());

    let early_tie = request(
        &client,
        &base,
        Method::POST,
        &format!("{year_path}/tie-breaks"),
        Some(&cookie),
        Some(json!({"teamId":team_a,"event":"golf","deltaPoints":0.5})),
    )
    .await;
    assert_eq!(early_tie.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        early_tie.json::<Value>().await.unwrap()["error"],
        "Year must be completed before applying a tie-break."
    );

    for (event, payload) in [
        ("fish-weights", json!({"teamId":"invalid","weight":1})),
        ("chug-times", json!({"teamId":team_a,"notes":42})),
        ("golf-scores", json!({"teamId":team_a,"score":75.5})),
        (
            "golf-scores",
            json!({"teamId":team_a,"score":2147483648_i64}),
        ),
    ] {
        let response = request(
            &client,
            &base,
            Method::POST,
            &format!("{year_path}/{event}"),
            Some(&cookie),
            Some(payload),
        )
        .await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{event}");
        assert_eq!(
            response.json::<Value>().await.unwrap()["error"],
            "Invalid request body"
        );
    }
    let chug_path = format!("{year_path}/chug-times");
    let golf_path = format!("{year_path}/golf-scores");
    for (path, payload) in [
        (
            &chug_path,
            json!({"teamId":team_a,"chug1":4,"chug2":6,"average":5,"notes":"first"}),
        ),
        (&chug_path, json!({"teamId":team_a,"chug1":3})),
        (
            &golf_path,
            json!({"teamId":team_a,"score":80,"notes":"first"}),
        ),
        (&golf_path, json!({"teamId":team_a,"score":72})),
    ] {
        assert_eq!(
            request(
                &client,
                &base,
                Method::POST,
                path,
                Some(&cookie),
                Some(payload)
            )
            .await
            .status(),
            StatusCode::CREATED
        );
    }
    let chug: Value = request(&client, &base, Method::GET, &chug_path, None, None)
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(chug.as_array().unwrap().len(), 1);
    assert_eq!(chug[0]["chug1"], "3.000");
    assert_eq!(chug[0]["chug2"], "6.000");
    let golf: Value = request(&client, &base, Method::GET, &golf_path, None, None)
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(golf.as_array().unwrap().len(), 1);
    assert_eq!(golf[0]["score"], 72);
    for event in ["chug-times", "golf-scores"] {
        let path = format!("{year_path}/teams/{team_a}/{event}");
        assert_eq!(
            request(&client, &base, Method::DELETE, &path, Some(&cookie), None)
                .await
                .status(),
            StatusCode::OK
        );
        let items: Value = request(
            &client,
            &base,
            Method::GET,
            &format!("{year_path}/{event}"),
            None,
            None,
        )
        .await
        .json()
        .await
        .unwrap();
        assert!(items.as_array().unwrap().is_empty());
    }

    let next_year = request(
        &client,
        &base,
        Method::POST,
        "/api/years",
        Some(&cookie),
        Some(json!({})),
    )
    .await;
    assert_eq!(next_year.status(), StatusCode::CREATED);
    let next_year: Value = next_year.json().await.unwrap();
    assert_eq!(next_year["year"], 2100);
    assert_eq!(next_year["status"], "upcoming");
    let other_path = format!("/api/years/{}", next_year["id"].as_str().unwrap());
    for path in [&year_path, &other_path] {
        for (event, payload) in [
            ("fish-weights", json!({"teamId":team_a,"weight":2.5})),
            ("chug-times", json!({"teamId":team_a,"average":5})),
            ("golf-scores", json!({"teamId":team_a,"score":75})),
        ] {
            assert_eq!(
                request(
                    &client,
                    &base,
                    Method::POST,
                    &format!("{path}/{event}"),
                    Some(&cookie),
                    Some(payload)
                )
                .await
                .status(),
                StatusCode::CREATED
            );
        }
    }
    let clear = request(
        &client,
        &base,
        Method::DELETE,
        &format!("{year_path}/scores"),
        Some(&cookie),
        None,
    )
    .await;
    assert_eq!(clear.status(), StatusCode::OK);
    assert_eq!(
        clear.json::<Value>().await.unwrap()["message"],
        "All scores cleared for year"
    );
    for event in ["fish-weights", "chug-times", "golf-scores"] {
        let cleared: Value = request(
            &client,
            &base,
            Method::GET,
            &format!("{year_path}/{event}"),
            None,
            None,
        )
        .await
        .json()
        .await
        .unwrap();
        assert!(cleared.as_array().unwrap().is_empty());
        let retained: Value = request(
            &client,
            &base,
            Method::GET,
            &format!("{other_path}/{event}"),
            None,
            None,
        )
        .await
        .json()
        .await
        .unwrap();
        assert_eq!(retained.as_array().unwrap().len(), 1);
    }

    let rejected = request(
        &client,
        &base,
        Method::PATCH,
        &year_path,
        Some(&cookie),
        Some(json!({"status":"completed"})),
    )
    .await;
    assert_eq!(rejected.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        rejected.json::<Value>().await.unwrap()["error"],
        "All three events must be locked before marking the year as completed."
    );

    for team in [&team_a, &team_b] {
        for (path, body) in [
            (
                "chug-times",
                json!({"teamId":team,"chug1":5,"chug2":"6.000","average":5.5}),
            ),
            ("golf-scores", json!({"teamId":team,"score":75})),
        ] {
            let response = request(
                &client,
                &base,
                Method::POST,
                &format!("{year_path}/{path}"),
                Some(&cookie),
                Some(body),
            )
            .await;
            assert_eq!(response.status(), StatusCode::CREATED, "{path}");
        }
    }
    let fish_path = format!("{year_path}/fish-weights");
    assert_eq!(
        request(
            &client,
            &base,
            Method::POST,
            &fish_path,
            Some(&cookie),
            Some(json!({"teamId":team_c,"weight":99.5}))
        )
        .await
        .status(),
        StatusCode::CREATED
    );
    let fish = request(&client, &base, Method::GET, &fish_path, None, None).await;
    assert_eq!(fish.status(), StatusCode::OK);
    assert_eq!(
        fish.json::<Value>()
            .await
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let delete_fish = format!("{year_path}/teams/{team_c}/fish-weights");
    assert_eq!(
        request(
            &client,
            &base,
            Method::DELETE,
            &delete_fish,
            Some(&cookie),
            None
        )
        .await
        .status(),
        StatusCode::OK
    );
    assert!(
        request(&client, &base, Method::GET, &fish_path, None, None)
            .await
            .json::<Value>()
            .await
            .unwrap()
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        request(
            &client,
            &base,
            Method::POST,
            &fish_path,
            Some(&cookie),
            Some(json!({"teamId":team_c,"weight":"99.50"}))
        )
        .await
        .status(),
        StatusCode::CREATED
    );

    let completed = request(&client, &base, Method::PATCH, &year_path, Some(&cookie), Some(json!({"status":"completed","fishing_locked":true,"chug_locked":true,"golf_locked":true}))).await;
    assert_eq!(completed.status(), StatusCode::OK);
    assert_eq!(
        completed.json::<Value>().await.unwrap()["status"],
        "completed"
    );
    assert!(ids(&db, "champs").await.is_empty());
    let mut expected_boots = vec![kak_a.clone(), kak_b.clone()];
    expected_boots.sort();
    assert_eq!(ids(&db, "boots").await, expected_boots);
    assert_eq!(
        request(
            &client,
            &base,
            Method::POST,
            &fish_path,
            Some(&cookie),
            Some(json!({"teamId":team_a,"weight":2}))
        )
        .await
        .status(),
        StatusCode::FORBIDDEN
    );

    let tie_path = format!("{year_path}/tie-breaks");
    for (payload, message) in [
        (
            json!({"event":"golf","deltaPoints":0.5}),
            "teamId is required",
        ),
        (
            json!({"teamId":team_a,"event":"chug","deltaPoints":0.5}),
            "Only golf tie-breaks are supported right now.",
        ),
        (
            json!({"teamId":team_a,"event":"golf","deltaPoints":1}),
            "deltaPoints must be 0.5",
        ),
        (
            json!({"teamId":team_c,"event":"golf","deltaPoints":0.5}),
            "teamId must be one of the tied teams.",
        ),
    ] {
        let response = request(
            &client,
            &base,
            Method::POST,
            &tie_path,
            Some(&cookie),
            Some(payload),
        )
        .await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(response.json::<Value>().await.unwrap()["error"], message);
    }
    for event in ["fish-weights", "chug-times", "golf-scores"] {
        let response = request(
            &client,
            &base,
            Method::DELETE,
            &format!("{year_path}/teams/{team_a}/{event}"),
            Some(&cookie),
            None,
        )
        .await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN, "{event}");
    }
    let tie = request(
        &client,
        &base,
        Method::POST,
        &tie_path,
        Some(&cookie),
        Some(json!({"teamId":team_a,"event":"golf","deltaPoints":0.5})),
    )
    .await;
    assert_eq!(tie.status(), StatusCode::CREATED);
    assert_eq!(ids(&db, "champs").await, vec![kak_a.clone()]);

    let tie_list: Value = request(&client, &base, Method::GET, &tie_path, None, None)
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(tie_list.as_array().unwrap().len(), 1);
    assert_eq!(tie_list[0]["teamId"], team_a);
    assert_eq!(tie_list[0]["event"], "golf");
    assert_eq!(tie_list[0]["deltaPoints"], "0.50");
    let duplicate_tie = request(
        &client,
        &base,
        Method::POST,
        &tie_path,
        Some(&cookie),
        Some(json!({"teamId":team_a,"event":"golf","deltaPoints":0.5})),
    )
    .await;
    assert_eq!(duplicate_tie.status(), StatusCode::CONFLICT);
    let stats: Value = request(&client, &base, Method::GET, "/api/kak-stats", None, None)
        .await
        .json()
        .await
        .unwrap();
    assert!(
        stats["champs"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["kakId"] == kak_a && item["total"] == 1)
    );
    assert!(
        stats["boots"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["kakId"] == kak_b && item["total"] == 1)
    );
    let results: Value = request(&client, &base, Method::GET, "/api/kak-results", None, None)
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(results[0]["year"], 2099);
    assert_eq!(results[0]["champs"], json!(["Fixture A"]));
    assert_eq!(results[0]["boots"], json!(["Fixture B"]));
    assert_eq!(ids(&db, "boots").await, vec![kak_b.clone()]);
    assert_eq!(
        request(
            &client,
            &base,
            Method::DELETE,
            &tie_path,
            Some(&cookie),
            None
        )
        .await
        .status(),
        StatusCode::OK
    );
    assert!(ids(&db, "champs").await.is_empty());
    assert_eq!(ids(&db, "boots").await, expected_boots);

    let logout = request(
        &client,
        &base,
        Method::POST,
        "/api/auth/logout",
        Some(&cookie),
        None,
    )
    .await;
    assert_eq!(logout.status(), StatusCode::OK);
    assert!(
        logout
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .contains("Max-Age=0")
    );
    server.abort();
    db.close().await;
    sqlx::query(&format!("DROP SCHEMA \"{schema}\" CASCADE"))
        .execute(&admin_db)
        .await
        .expect("drop isolated fixture schema");
    admin_db.close().await;
}

#[tokio::test]
async fn score_idempotency_survives_retries_concurrency_and_cache_failure() {
    use axum::{Json, extract::State, http::HeaderMap, routing::post};
    use std::sync::Arc;
    use tokio::sync::Mutex;

    async fn wait_for_lock(db: &PgPool, event: &str, query: &str) {
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            loop {
                let found: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND wait_event=$1 AND query LIKE $2)"
                ).bind(event).bind(query).fetch_one(db).await.unwrap();
                if found { break; }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        }).await.expect("request reached the expected database lock");
    }

    let url = std::env::var("TEST_DATABASE_URL").expect("set TEST_DATABASE_URL to a non-production database");
    if let Ok(production_url) = std::env::var("DATABASE_URL") {
        assert_ne!(url, production_url);
    }
    let schema = format!("kakcup_idempotency_{}_{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos());
    let admin_db = PgPoolOptions::new().max_connections(1).connect(&url).await.unwrap();
    sqlx::query(&format!("CREATE SCHEMA \"{schema}\"")).execute(&admin_db).await.unwrap();
    let search_path = schema.clone();
    let db = PgPoolOptions::new().max_connections(8).after_connect(move |conn, _| {
        let search_path = search_path.clone();
        Box::pin(async move {
            sqlx::query("SELECT set_config('search_path', $1, false)").bind(search_path).execute(conn).await?;
            Ok(())
        })
    }).connect(&url).await.unwrap();
    sqlx::raw_sql(SCHEMA).execute(&db).await.unwrap();
    for _ in 0..2 {
        sqlx::raw_sql(include_str!("../../migrations/0001_score_idempotency.sql")).execute(&db).await.unwrap();
    }
    let admin: String = sqlx::query_scalar("INSERT INTO users(username,role) VALUES ('one','admin') RETURNING id::text").fetch_one(&db).await.unwrap();
    let other_admin: String = sqlx::query_scalar("INSERT INTO users(username,role) VALUES ('two','admin') RETURNING id::text").fetch_one(&db).await.unwrap();
    let year: String = sqlx::query_scalar("INSERT INTO years(year,name) VALUES (2099,'Fixture') RETURNING id::text").fetch_one(&db).await.unwrap();
    let team: String = sqlx::query_scalar("INSERT INTO teams(year_id,name,position) VALUES ($1::uuid,'Fixture',1) RETURNING id::text").bind(&year).fetch_one(&db).await.unwrap();
    let expiry = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() + 3600;
    let cookie = |id: &str, role: &str| format!("token={}", jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &json!({"userId":id,"username":"fixture","role":role,"exp":expiry}),
        &jsonwebtoken::EncodingKey::from_secret(b"idempotency-secret"),
    ).unwrap());
    let admin_cookie = cookie(&admin, "admin");
    let other_cookie = cookie(&other_admin, "admin");
    let user_cookie = cookie(&admin, "user");

    // First DEL fails after the PostgreSQL commit; later DELs return sync tokens.
    let calls: Arc<Mutex<Vec<(Value, Option<String>)>>> = Arc::new(Mutex::new(Vec::new()));
    let redis = Router::new().route("/", post(
        |State(calls): State<Arc<Mutex<Vec<(Value, Option<String>)>>>>, headers: HeaderMap, Json(command): Json<Value>| async move {
            let token = headers.get("upstash-sync-token").and_then(|v| v.to_str().ok()).map(str::to_owned);
            let count = {
                let mut calls = calls.lock().await;
                calls.push((command, token));
                calls.len()
            };
            if count == 1 {
                (axum::http::StatusCode::SERVICE_UNAVAILABLE, [("upstash-sync-token", "ignored")], Json(json!({"error":"unavailable"})))
            } else {
                (axum::http::StatusCode::OK, [("upstash-sync-token", "synced")], Json(json!({"result":1})))
            }
        }
    )).with_state(calls.clone());
    let redis_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let redis_url = format!("http://{}/", redis_listener.local_addr().unwrap());
    let redis_server = tokio::spawn(async move { axum::serve(redis_listener, redis).await.unwrap() });
    let state = AppState {
        db: db.clone(), http: Client::new(), redis_url: Some(redis_url),
        redis_token: Some("fixture".into()), cache_prefix: "test:".into(), jwt_secret: "idempotency-secret".into(),
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, app(state)).await.unwrap() });
    let client = Client::new();
    let fish_path = format!("/api/years/{year}/fish-weights");
    let payload = json!({"teamId":team,"weight":3.25});
    let send = |path: String, key: &'static str, data: Value, cookie: String| {
        let client = client.clone();
        let url = format!("{base}{path}");
        let request_user = if cookie == other_cookie { other_admin.clone() } else { admin.clone() };
        async move { client.post(url).header("cookie", cookie).header("idempotency-key", key).header("x-score-user", request_user).json(&data).send().await.unwrap() }
    };

    assert_eq!(send(fish_path.clone(), "failed-invalidation", payload.clone(), admin_cookie.clone()).await.status(), StatusCode::INTERNAL_SERVER_ERROR);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM fish_weights").fetch_one(&db).await.unwrap();
    assert_eq!(count, 1);
    let recovered = send(fish_path.clone(), "failed-invalidation", payload.clone(), admin_cookie.clone()).await;
    assert_eq!(recovered.status(), StatusCode::CREATED);
    let original: Value = recovered.json().await.unwrap();
    let replay = send(fish_path.clone(), "failed-invalidation", payload.clone(), admin_cookie.clone()).await;
    assert_eq!(replay.status(), StatusCode::CREATED);
    assert_eq!(replay.json::<Value>().await.unwrap(), original);
    {
        let calls = calls.lock().await;
        assert_eq!(calls.len(), 3);
        assert_eq!(calls[0].0, json!(["DEL", format!("test:fw:{year}")]));
        assert_eq!(calls[1].0, calls[0].0);
        assert_eq!(calls[2].0, calls[0].0);
        assert_eq!(calls[1].1, None);
        assert_eq!(calls[2].1.as_deref(), Some("synced"));
    }
    assert_eq!(send(fish_path.clone(), "failed-invalidation", json!({"teamId":team,"weight":4}), admin_cookie.clone()).await.status(), StatusCode::CONFLICT);
    assert_eq!(send(format!("/api/years/{year}/golf-scores"), "failed-invalidation", payload.clone(), admin_cookie.clone()).await.status(), StatusCode::CONFLICT);
    assert_eq!(send("/api/years/other/fish-weights".into(), "failed-invalidation", payload.clone(), admin_cookie.clone()).await.status(), StatusCode::CONFLICT);
    assert_eq!(send(fish_path.clone(), "failed-invalidation", payload.clone(), user_cookie).await.status(), StatusCode::FORBIDDEN);
    let switched = client.post(format!("{base}{fish_path}")).header("cookie", &other_cookie)
        .header("idempotency-key", "not-yet-sent").header("x-score-user", &admin).json(&payload).send().await.unwrap();
    assert_eq!(switched.status(), StatusCode::CONFLICT);
    // Switching accounts must never turn a replay into a second insert.
    assert_eq!(send(fish_path.clone(), "failed-invalidation", payload.clone(), other_cookie.clone()).await.status(), StatusCode::CONFLICT);
    assert_eq!(send(fish_path.clone(), "other-admin-save", payload.clone(), other_cookie.clone()).await.status(), StatusCode::CREATED);

    // Hold the first insert inside its transaction until the second request is
    // waiting on the unique reservation, rather than relying on scheduler timing.
    sqlx::raw_sql("CREATE FUNCTION hold_fish_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(746933018); RETURN NEW; END $$; CREATE TRIGGER hold_fish BEFORE INSERT ON fish_weights FOR EACH ROW EXECUTE FUNCTION hold_fish_insert();")
        .execute(&db).await.unwrap();
    let mut hold = db.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(746933018)").execute(&mut *hold).await.unwrap();
    let a = tokio::spawn(send(fish_path.clone(), "concurrent", payload.clone(), admin_cookie.clone()));
    wait_for_lock(&db, "advisory", "INSERT INTO fish_weights%").await;
    let b = tokio::spawn(send(fish_path.clone(), "concurrent", payload.clone(), admin_cookie.clone()));
    wait_for_lock(&db, "transactionid", "INSERT INTO score_idempotency%").await;
    hold.commit().await.unwrap();
    let (a, b) = (a.await.unwrap(), b.await.unwrap());
    sqlx::raw_sql("DROP TRIGGER hold_fish ON fish_weights; DROP FUNCTION hold_fish_insert();").execute(&db).await.unwrap();
    assert_eq!(a.status(), StatusCode::CREATED);
    assert_eq!(b.status(), StatusCode::CREATED);
    assert_eq!(a.json::<Value>().await.unwrap(), b.json::<Value>().await.unwrap());
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM fish_weights").fetch_one(&db).await.unwrap();
    assert_eq!(count, 3);

    // An uncommitted reservation must not poison the key.
    let mut tx = db.begin().await.unwrap();
    sqlx::query("INSERT INTO score_idempotency(user_id,idempotency_key,request_path,request_body) VALUES ($1::uuid,'rolled-back',$2,$3)")
        .bind(&admin).bind(&fish_path).bind(&payload).execute(&mut *tx).await.unwrap();
    let pending = tokio::spawn(send(fish_path.clone(), "rolled-back", payload.clone(), admin_cookie.clone()));
    wait_for_lock(&db, "transactionid", "INSERT INTO score_idempotency%").await;
    tx.rollback().await.unwrap();
    assert_eq!(pending.await.unwrap().status(), StatusCode::CREATED);
    assert_eq!(send(fish_path.clone(), "validation", json!({"teamId":"invalid"}), admin_cookie.clone()).await.status(), StatusCode::BAD_REQUEST);
    assert_eq!(send(fish_path.clone(), "validation", payload.clone(), admin_cookie.clone()).await.status(), StatusCode::CREATED);

    // A failed score INSERT rolls back both the row and its reservation.
    // Sequences are nontransactional, so the second identical attempt succeeds.
    sqlx::raw_sql("CREATE SEQUENCE fail_once; CREATE FUNCTION fail_first_fish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF nextval('fail_once') = 1 THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_first BEFORE INSERT ON fish_weights FOR EACH ROW EXECUTE FUNCTION fail_first_fish();")
        .execute(&db).await.unwrap();
    assert_eq!(send(fish_path.clone(), "aborted-mutation", payload.clone(), admin_cookie.clone()).await.status(), StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(send(fish_path.clone(), "aborted-mutation", payload.clone(), admin_cookie.clone()).await.status(), StatusCode::CREATED);
    sqlx::raw_sql("DROP TRIGGER fail_first ON fish_weights; DROP FUNCTION fail_first_fish(); DROP SEQUENCE fail_once;").execute(&db).await.unwrap();

    // Closing an event must wait for an already-accepted score transaction.
    // Otherwise completion could calculate results before that score commits.
    sqlx::raw_sql("CREATE FUNCTION hold_fish_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(746933019); RETURN NEW; END $$; CREATE TRIGGER hold_fish BEFORE INSERT ON fish_weights FOR EACH ROW EXECUTE FUNCTION hold_fish_insert();")
        .execute(&db).await.unwrap();
    let mut hold = db.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(746933019)").execute(&mut *hold).await.unwrap();
    let score = tokio::spawn(send(fish_path.clone(), "score-before-lock", payload.clone(), admin_cookie.clone()));
    wait_for_lock(&db, "advisory", "INSERT INTO fish_weights%").await;
    let lock_client = client.clone();
    let lock_url = format!("{base}/api/years/{year}");
    let lock_cookie = admin_cookie.clone();
    let lock = tokio::spawn(async move {
        lock_client.patch(lock_url).header("cookie", lock_cookie)
            .json(&json!({"fishing_locked": true})).send().await.unwrap()
    });
    wait_for_lock(&db, "transactionid", "UPDATE years SET fishing_locked%").await;
    hold.commit().await.unwrap();
    assert_eq!(score.await.unwrap().status(), StatusCode::CREATED);
    assert_eq!(lock.await.unwrap().status(), StatusCode::OK);
    assert_eq!(send(fish_path.clone(), "score-after-lock", payload.clone(), admin_cookie.clone()).await.status(), StatusCode::FORBIDDEN);
    sqlx::raw_sql("DROP TRIGGER hold_fish ON fish_weights; DROP FUNCTION hold_fish_insert();")
        .execute(&db).await.unwrap();
    sqlx::query("UPDATE years SET fishing_locked=false WHERE id=$1::uuid").bind(&year).execute(&db).await.unwrap();

    for (event, first, second, field) in [
        ("chug-times", json!({"teamId":team,"average":5}), json!({"teamId":team,"average":7}), "average"),
        ("golf-scores", json!({"teamId":team,"score":70}), json!({"teamId":team,"score":80}), "score"),
    ] {
        let path = format!("/api/years/{year}/{event}");
        let first_response = send(path.clone(), "first-upsert", first.clone(), admin_cookie.clone()).await;
        // Keys cannot be reused for a different route.
        if event == "golf-scores" {
            assert_eq!(first_response.status(), StatusCode::CONFLICT);
        } else {
            assert_eq!(first_response.status(), StatusCode::CREATED);
            let first_body: Value = first_response.json().await.unwrap();
            assert_eq!(send(path.clone(), "second-upsert", second, admin_cookie.clone()).await.status(), StatusCode::CREATED);
            let replay = send(path, "first-upsert", first, admin_cookie.clone()).await;
            assert_eq!(replay.status(), StatusCode::CREATED);
            assert_eq!(replay.json::<Value>().await.unwrap(), first_body);
            let stored: String = sqlx::query_scalar("SELECT average::text FROM chug_times WHERE year_id=$1::uuid").bind(&year).fetch_one(&db).await.unwrap();
            assert_eq!(stored, "7.000", "{field} was not reverted by replay");
        }
    }
    let golf_path = format!("/api/years/{year}/golf-scores");
    let golf_first = json!({"teamId":team,"score":70});
    let golf_response = send(golf_path.clone(), "golf-first", golf_first.clone(), admin_cookie.clone()).await;
    assert_eq!(golf_response.status(), StatusCode::CREATED);
    let golf_body: Value = golf_response.json().await.unwrap();
    assert_eq!(send(golf_path.clone(), "golf-second", json!({"teamId":team,"score":80}), admin_cookie.clone()).await.status(), StatusCode::CREATED);
    let golf_replay = send(golf_path.clone(), "golf-first", golf_first.clone(), admin_cookie.clone()).await;
    assert_eq!(golf_replay.status(), StatusCode::CREATED);
    assert_eq!(golf_replay.json::<Value>().await.unwrap(), golf_body);
    let golf: i32 = sqlx::query_scalar("SELECT score FROM golf_scores WHERE year_id=$1::uuid").bind(&year).fetch_one(&db).await.unwrap();
    assert_eq!(golf, 80);

    sqlx::query("UPDATE years SET fishing_locked=true,chug_locked=true,golf_locked=true WHERE id=$1::uuid").bind(&year).execute(&db).await.unwrap();
    let locked_replay = send(fish_path.clone(), "failed-invalidation", payload.clone(), admin_cookie.clone()).await;
    assert_eq!(locked_replay.status(), StatusCode::CREATED);
    assert_eq!(locked_replay.json::<Value>().await.unwrap(), original);
    assert_eq!(send(fish_path.clone(), "new-locked", payload.clone(), admin_cookie.clone()).await.status(), StatusCode::FORBIDDEN);
    for (path, key, data, expected) in [
        (format!("/api/years/{year}/chug-times"), "first-upsert", json!({"teamId":team,"average":5}), json!("5.000")),
        (golf_path.clone(), "golf-first", golf_first.clone(), json!(70)),
    ] {
        let replay = send(path.clone(), key, data.clone(), admin_cookie.clone()).await;
        assert_eq!(replay.status(), StatusCode::CREATED);
        let body: Value = replay.json().await.unwrap();
        assert_eq!(body[if key == "first-upsert" { "average" } else { "score" }], expected);
        assert_eq!(send(path, "new-locked", data, admin_cookie.clone()).await.status(), StatusCode::FORBIDDEN);
    }
    sqlx::query("UPDATE years SET fishing_locked=false WHERE id=$1::uuid").bind(&year).execute(&db).await.unwrap();
    for _ in 0..2 {
        assert_eq!(request(&client, &base, Method::POST, &fish_path, Some(&admin_cookie), Some(payload.clone())).await.status(), StatusCode::CREATED);
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM fish_weights").fetch_one(&db).await.unwrap();
    assert_eq!(count, 9);
    server.abort();
    redis_server.abort();
    db.close().await;
    sqlx::query(&format!("DROP SCHEMA \"{schema}\" CASCADE")).execute(&admin_db).await.unwrap();
    admin_db.close().await;
}

// The same 2025 results and hand-verified standings as the TypeScript replay.
struct ReplayTeam {
    name: &'static str,
    members: [&'static str; 4],
    fish: [f64; 3],
    chugs: [f64; 2],
    golf: i32,
    fish_total: f64,
    chug_average: f64,
    points: [f64; 3],
    total: f64,
}

const REPLAY_2025: [ReplayTeam; 7] = [
    ReplayTeam { name: "Champs", members: ["Pope", "Dump Bear", "Dyer", "Bopper"], fish: [2.57, 2.49, 2.42], chugs: [15.92, 15.94], golf: -8, fish_total: 7.48, chug_average: 15.93, points: [5.0, 6.0, 5.0], total: 16.0 },
    ReplayTeam { name: "Team 1", members: ["Nych", "Colin", "Norton", "Booya"], fish: [2.00, 1.91, 1.67], chugs: [15.08, 15.10], golf: -5, fish_total: 5.58, chug_average: 15.09, points: [4.0, 7.0, 2.0], total: 13.0 },
    ReplayTeam { name: "Team 2", members: ["Body", "Boxy", "Tank", "Muldoon"], fish: [1.25, 1.10, 1.03], chugs: [21.00, 20.70], golf: -8, fish_total: 3.38, chug_average: 20.85, points: [1.0, 2.0, 5.0], total: 8.0 },
    ReplayTeam { name: "Team 3", members: ["Murr", "Sewter", "Burnie", "Newt"], fish: [3.37, 1.05, 0.72], chugs: [18.55, 18.35], golf: -9, fish_total: 5.14, chug_average: 18.45, points: [3.0, 3.0, 7.0], total: 13.0 },
    ReplayTeam { name: "Team 4", members: ["Stubby", "Pete", "No Show", "Mckay"], fish: [8.17, 3.36, 1.91], chugs: [35.50, 35.50], golf: -8, fish_total: 13.44, chug_average: 35.50, points: [7.0, 1.0, 5.0], total: 13.0 },
    ReplayTeam { name: "Team 5", members: ["Hooper", "Burns", "Jocquo", "Fatty"], fish: [1.45, 1.36, 0.61], chugs: [16.00, 15.98], golf: 2, fish_total: 3.42, chug_average: 15.99, points: [2.0, 5.0, 1.0], total: 8.0 },
    ReplayTeam { name: "Team 6", members: ["TBone", "Sub", "Dano", "Morash"], fish: [2.87, 2.56, 2.09], chugs: [17.86, 17.82], golf: -6, fish_total: 7.52, chug_average: 17.84, points: [6.0, 4.0, 3.0], total: 13.0 },
];

async fn enter_2025_scores(client: &Client, base: &str, year_path: &str, cookie: &str, team_ids: &[String]) {
    use kakcup_backend::scoring::calculate_chug_average;

    for (team, team_id) in REPLAY_2025.iter().zip(team_ids) {
        for weight in team.fish {
            let response = request(client, base, Method::POST, &format!("{year_path}/fish-weights"), Some(cookie), Some(json!({"teamId": team_id, "weight": weight}))).await;
            assert_eq!(response.status(), StatusCode::CREATED, "{} fish", team.name);
        }
        let average = calculate_chug_average(team.chugs[0], team.chugs[1]).unwrap();
        let response = request(client, base, Method::POST, &format!("{year_path}/chug-times"), Some(cookie), Some(json!({"teamId": team_id, "chug1": team.chugs[0], "chug2": team.chugs[1], "average": average}))).await;
        assert_eq!(response.status(), StatusCode::CREATED, "{} chug", team.name);
        let response = request(client, base, Method::POST, &format!("{year_path}/golf-scores"), Some(cookie), Some(json!({"teamId": team_id, "score": team.golf}))).await;
        assert_eq!(response.status(), StatusCode::CREATED, "{} golf", team.name);
    }
}

async fn assert_2025_standings(client: &Client, base: &str, year_path: &str, team_ids: &[String]) {
    use kakcup_backend::scoring::{calculate_top3_fish_total, rank_chug_teams, rank_fish_teams, rank_golf_teams};
    use std::collections::HashMap;

    let mut values = Vec::new();
    for event in ["fish-weights", "chug-times", "golf-scores"] {
        let response = request(client, base, Method::GET, &format!("{year_path}/{event}"), None, None).await;
        assert_eq!(response.status(), StatusCode::OK, "{event}");
        values.push(response.json::<Vec<Value>>().await.unwrap());
    }
    assert_eq!(values[0].len(), 21);
    assert_eq!(values[1].len(), 7);
    assert_eq!(values[2].len(), 7);

    let mut fish = HashMap::new();
    let mut chug = HashMap::new();
    let mut golf = HashMap::new();
    for (team, team_id) in REPLAY_2025.iter().zip(team_ids) {
        let mut weights: Vec<f64> = values[0].iter().filter(|row| row["teamId"] == *team_id)
            .map(|row| row["weight"].as_str().unwrap().parse().unwrap()).collect();
        weights.sort_by(f64::total_cmp);
        let mut expected_weights = team.fish;
        expected_weights.sort_by(f64::total_cmp);
        assert_eq!(weights, expected_weights, "{} fish entries", team.name);
        let total = calculate_top3_fish_total(&weights);
        assert!((total - team.fish_total).abs() < 0.001, "{} fish total", team.name);
        fish.insert(team_id.clone(), total);

        let chug_rows: Vec<_> = values[1].iter().filter(|row| row["teamId"] == *team_id).collect();
        assert_eq!(chug_rows.len(), 1, "{} chug entries", team.name);
        let average: f64 = chug_rows[0]["average"].as_str().unwrap().parse().unwrap();
        assert!((average - team.chug_average).abs() < 0.001, "{} chug average", team.name);
        chug.insert(team_id.clone(), average);

        let golf_rows: Vec<_> = values[2].iter().filter(|row| row["teamId"] == *team_id).collect();
        assert_eq!(golf_rows.len(), 1, "{} golf entries", team.name);
        let score = golf_rows[0]["score"].as_i64().unwrap();
        assert_eq!(score, team.golf as i64, "{} golf score", team.name);
        golf.insert(team_id.clone(), score as f64);
    }

    let points = [rank_fish_teams(&fish), rank_chug_teams(&chug), rank_golf_teams(&golf)];
    for (team, team_id) in REPLAY_2025.iter().zip(team_ids) {
        let actual = [points[0][team_id], points[1][team_id], points[2][team_id]];
        assert_eq!(actual, team.points, "{} event points", team.name);
        assert_eq!(actual.iter().sum::<f64>(), team.total, "{} overall points", team.name);
    }
}

#[tokio::test]
async fn historical_2025_tournament_replay_through_api() {
    let url = std::env::var("TEST_DATABASE_URL")
        .expect("set TEST_DATABASE_URL to an isolated non-production PostgreSQL database");
    if let Ok(production_url) = std::env::var("DATABASE_URL") {
        assert_ne!(url, production_url, "TEST_DATABASE_URL must not be DATABASE_URL");
    }
    let schema = format!("kakcup_replay_{}_{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos());
    let admin_db = PgPoolOptions::new().max_connections(1).connect(&url).await.unwrap();
    sqlx::query(&format!("CREATE SCHEMA \"{schema}\"")).execute(&admin_db).await.unwrap();
    let search_path = schema.clone();
    let db = PgPoolOptions::new().max_connections(4).after_connect(move |connection, _| {
        let search_path = search_path.clone();
        Box::pin(async move {
            sqlx::query("SELECT set_config('search_path', $1, false)").bind(search_path).execute(connection).await?;
            Ok(())
        })
    }).connect(&url).await.unwrap();
    sqlx::raw_sql(SCHEMA).execute(&db).await.unwrap();
    sqlx::raw_sql(include_str!("../../migrations/0001_score_idempotency.sql"))
        .execute(&db).await.unwrap();
    let password_hash = bcrypt::hash("replay-password", 4).unwrap();
    sqlx::query("INSERT INTO users(username,password_hash,role) VALUES ('replay-admin',$1,'admin')")
        .bind(password_hash).execute(&db).await.unwrap();
    let year: String = sqlx::query_scalar("INSERT INTO years(year,name,status) VALUES (2025,'KAK Cup 2025','active') RETURNING id::text")
        .fetch_one(&db).await.unwrap();
    let state = AppState {
        db: db.clone(), http: Client::new(), redis_url: None, redis_token: None,
        cache_prefix: String::new(), jwt_secret: "replay-only-secret".into(),
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, app(state)).await.unwrap() });
    let client = Client::new();
    let login = request(&client, &base, Method::POST, "/api/auth/login", None, Some(json!({"username":"replay-admin","password":"replay-password"}))).await;
    assert_eq!(login.status(), StatusCode::OK);
    let cookie = login.headers().get("set-cookie").unwrap().to_str().unwrap().split(';').next().unwrap().to_owned();
    let year_path = format!("/api/years/{year}");

    let mut team_ids = Vec::new();
    for (position, team) in REPLAY_2025.iter().enumerate() {
        let mut member_ids = Vec::new();
        for name in team.members {
            let response = request(&client, &base, Method::POST, "/api/kaks", Some(&cookie), Some(json!({"name":name}))).await;
            assert_eq!(response.status(), StatusCode::CREATED, "{name}");
            member_ids.push(response.json::<Value>().await.unwrap()["id"].as_str().unwrap().to_owned());
        }
        let response = request(&client, &base, Method::POST, &format!("{year_path}/teams"), Some(&cookie), Some(json!({
            "name": team.name, "position": position + 1,
            "kak1": team.members[0], "kak2": team.members[1], "kak3": team.members[2], "kak4": team.members[3],
            "kak1Id": member_ids[0], "kak2Id": member_ids[1], "kak3Id": member_ids[2], "kak4Id": member_ids[3]
        }))).await;
        assert_eq!(response.status(), StatusCode::CREATED, "{}", team.name);
        let created: Value = response.json().await.unwrap();
        for (slot, member_id) in member_ids.iter().enumerate() {
            assert_eq!(created[format!("kak{}Id", slot + 1)], *member_id);
        }
        team_ids.push(created["id"].as_str().unwrap().to_owned());
    }

    enter_2025_scores(&client, &base, &year_path, &cookie, &team_ids).await;
    assert_2025_standings(&client, &base, &year_path, &team_ids).await;
    let cleared = request(&client, &base, Method::DELETE, &format!("{year_path}/scores"), Some(&cookie), None).await;
    assert_eq!(cleared.status(), StatusCode::OK);
    for event in ["fish-weights", "chug-times", "golf-scores"] {
        let response = request(&client, &base, Method::GET, &format!("{year_path}/{event}"), None, None).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.json::<Vec<Value>>().await.unwrap().is_empty(), "{event} after clearing");
    }
    enter_2025_scores(&client, &base, &year_path, &cookie, &team_ids).await;
    assert_2025_standings(&client, &base, &year_path, &team_ids).await;

    let locked = request(&client, &base, Method::PATCH, &year_path, Some(&cookie), Some(json!({"fishing_locked":true,"chug_locked":true,"golf_locked":true}))).await;
    assert_eq!(locked.status(), StatusCode::OK);
    let completed = request(&client, &base, Method::PATCH, &year_path, Some(&cookie), Some(json!({"status":"completed"}))).await;
    assert_eq!(completed.status(), StatusCode::OK);
    assert_eq!(completed.json::<Value>().await.unwrap()["status"], "completed");
    let persisted = request(&client, &base, Method::GET, "/api/years/2025", None, None).await;
    assert_eq!(persisted.status(), StatusCode::OK);
    assert_eq!(persisted.json::<Value>().await.unwrap()["status"], "completed");
    let results = request(&client, &base, Method::GET, "/api/kak-results", None, None).await;
    assert_eq!(results.status(), StatusCode::OK);
    let results: Value = results.json().await.unwrap();
    assert_eq!(results[0]["year"], 2025);
    assert_eq!(results[0]["champs"], json!(["Bopper", "Dump Bear", "Dyer", "Pope"]));
    assert_eq!(results[0]["boots"], json!(["Body", "Boxy", "Burns", "Fatty", "Hooper", "Jocquo", "Muldoon", "Tank"]));

    server.abort();
    db.close().await;
    sqlx::query(&format!("DROP SCHEMA \"{schema}\" CASCADE")).execute(&admin_db).await.unwrap();
    admin_db.close().await;
}
