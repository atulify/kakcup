use kakcup_backend::{AppState, app};
use tower::ServiceBuilder;
use vercel_runtime::axum::VercelLayer;

#[tokio::main]
async fn main() -> Result<(), vercel_runtime::Error> {
    let state = AppState::from_env()?;
    let service = ServiceBuilder::new()
        .layer(VercelLayer::new())
        .service(app(state));
    vercel_runtime::run(service).await
}
