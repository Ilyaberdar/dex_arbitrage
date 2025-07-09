mod threads;

use env_logger::Builder;
use tokio::sync::mpsc;
use tokio::task;
use anyhow::Result;


#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() -> Result<()> {
    // Initialize the logger, just make log nicer.
    Builder::from_default_env()
        .filter(None, log::LevelFilter::Info)
        .init();

    let (pf_tx, pf_rx) = mpsc::channel(10);
    task::spawn(threads::run_price_fetcher(pf_rx));

    loop {
        // watchdog for config file changes...
        //todo!("Implement config file watcher");

        // just for testing, fetch every 10 seconds
        tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

        pf_tx.send("Test Message".to_string()).await.unwrap();
    }

}