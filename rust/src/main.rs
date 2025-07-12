mod threads;

use env_logger::Builder;
use tokio::sync::mpsc;
use tokio::task;
use anyhow::Result;
use log::{info, error};
use serde_json;

mod context;
mod config;

use context::{CONTEXT, Context};
use config::Config;

#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() -> Result<()> {
    // Initialize the logger, just make log nicer.
    Builder::from_default_env()
        .filter(None, log::LevelFilter::Info)
        .init();

    // watcher placeholder to controll lifetime of it.
    let _watcher = Context::initialize_with_watcher();

    // test thread
    let (pf_tx, pf_rx) = mpsc::channel(10);
    task::spawn(threads::run_price_fetcher(pf_rx));

    loop {
        // Regular price fetch interval
        tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        pf_tx.send("Test Message".to_string()).await.unwrap();
    }
}
