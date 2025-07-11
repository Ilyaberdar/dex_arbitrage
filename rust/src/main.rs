mod threads;

use env_logger::Builder;
use tokio::sync::mpsc;
use tokio::sync::mpsc::{Receiver};
use tokio::task;
use anyhow::Result;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher, EventKind, Event};
use std::path::Path;
use std::time::Duration;
use std::sync::Arc;
use log::{info, error};
use serde_json;
use notify::Watcher as NotifyWatcher;


#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() -> Result<()> {
    // Initialize the logger, just make log nicer.
    Builder::from_default_env()
        .filter(None, log::LevelFilter::Info)
        .init();

    let (pf_tx, pf_rx) = mpsc::channel(10);
    task::spawn(threads::run_price_fetcher(pf_rx));

    // Setup file watcher for config.json
    let (w_tx, mut w_rx) = mpsc::channel(10);

    // Automatically select the best implementation for your platform.
    // You can also access each implementation directly e.g. INotifyWatcher.
    let mut watcher = RecommendedWatcher::new( move |res| {
        w_tx.blocking_send(res).unwrap();
    }, Config::default())?;

    // Add a path to be watched. All files and directories at that path and
    // below will be monitored for changes.
    watcher.watch(Path::new("config.json"), RecursiveMode::NonRecursive)?;

    while let Some(res) = w_rx.recv().await {
        match res {
            Ok(event) if event.kind.is_modify() => {log::info!("mod")},
            Ok(event) if event.kind.is_access() => {log::info!("acc")},
            Ok(event) => println!("unhandled: {:?}", event),
            Err(e) => println!("watch error: {:?}", e),
        }
    }


    loop {
        // Watch for config file changes

        // Reload config file
        match std::fs::read_to_string("config.json") {
            Ok(content) => {
                match serde_json::from_str::<serde_json::Value>(&content) {
                    Ok(config) => {
                        info!("Config reloaded: {:?}", config);
                        // TODO: Apply config changes to application
                    },
                    Err(e) => error!("Failed to parse config: {}", e),
                }
            },
            Err(e) => error!("Failed to read config file: {}", e),
        }

        // Regular price fetch interval
        tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        pf_tx.send("Test Message".to_string()).await.unwrap();
    }
}
