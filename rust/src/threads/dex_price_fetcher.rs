use ethers::providers::{Provider, Http};
use ethers::contract::abigen;
use ethers::types::{Address, U256};
use rust_decimal::prelude::*;
use std::sync::Arc;
use anyhow::Result;
use std::time::Instant;
use tokio::sync::mpsc;


abigen!(
    UniswapV3Pool,
    r#"[ "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)" ]"#
);

abigen!(
    ERC20,
    r#"[
        function decimals() view returns (uint8)
        function balanceOf(address owner) view returns (uint256)
    ]"#
);

struct DexPriceFetcherV3 {
    provider: Arc<Provider<Http>>,
    pool: UniswapV3Pool<Provider<Http>>,
    token0: ERC20<Provider<Http>>,
    token1: ERC20<Provider<Http>>,
    pool_address: Address,
    token0_address: Address,
    token1_address: Address,
    fee: f64,
}

impl DexPriceFetcherV3 {
    pub fn new(rpc_url: &str, pool_address: Address, token0_address: Address, token1_address: Address, fee: Option<f64>) -> Result<Self> {
        let provider = Arc::new(Provider::<Http>::try_from(rpc_url)?);
        let pool = UniswapV3Pool::new(pool_address, provider.clone());
        let token0 = ERC20::new(token0_address, provider.clone());
        let token1 = ERC20::new(token1_address, provider.clone());

        Ok(Self {
            provider,
            pool,
            token0,
            token1,
            pool_address,
            token0_address,
            token1_address,
            fee: fee.unwrap_or(0.003),
        })
    }

    pub async fn get_token_decimals(&self, token: &ERC20<Provider<Http>>) -> Result<u8> {
        Ok(token.decimals().call().await?)
    }

    pub async fn get_token_balance(&self, token: &ERC20<Provider<Http>>) -> Result<U256> {
        Ok(token.balance_of(self.pool_address).call().await?)
    }

    pub async fn get_sqrt_price_x96(&self) -> Result<U256> {
        Ok(self.pool.slot_0().call().await?.0)
    }

    pub async fn calculate_normalized_price(&self) -> Result<f64> {
        let sqrt_price_x96 = self.get_sqrt_price_x96().await?;

        let decimals0 = self.get_token_decimals(&self.token0).await?;
        let decimals1 = self.get_token_decimals(&self.token1).await?;

        let start = Instant::now(); // Perf start

        let sqrt = sqrt_price_x96.as_u128() as f64;
        let scale = f64::powi(2.0, 96);
        let mut price = (sqrt / scale).powi(2);

        let decimal_factor = f64::powi(10.0, decimals0 as i32 - decimals1 as i32);
        price *= decimal_factor;

        if price < 1e-6 {
            price = 1.0 / price;
        }

        let duration = start.elapsed();
        println!("Completed in: {:.2?}", duration);

        Ok(price)
    }

    pub async fn fetch_pool_price(&self) -> Result<()> {
        let decimals0 = self.get_token_decimals(&self.token0).await?;
        let decimals1 = self.get_token_decimals(&self.token1).await?;

        let bal0 = Decimal::from(self.get_token_balance(&self.token0).await?.as_u128());
        let bal1 = Decimal::from(self.get_token_balance(&self.token1).await?.as_u128());

        let balance0 = bal0 / Decimal::from(10u64.pow(decimals0 as u32));
        let balance1 = bal1 / Decimal::from(10u64.pow(decimals1 as u32));

        let raw_price = balance1 / balance0;
        let normalized_price = self.calculate_normalized_price().await?;

        
        println!("Balance 0: {balance0}, Balance 1: {balance1}");
        println!("Raw price: {raw_price}, Normalized price: {normalized_price}");

        Ok(())
    }
}


pub async fn run_price_fetcher(mut rx: mpsc::Receiver<String>) -> Result<()> {
    let rpc = "https://eth-mainnet.g.alchemy.com/v2/2S3IoADMLVdnijcimHMG9bzqpGhQ-Hgn";
    let pool = "0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35".parse()?;
    let token0 = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599".parse()?; // WBTC
    let token1 = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".parse()?; // USDC

    let fetcher = DexPriceFetcherV3::new(rpc, pool, token0, token1, Some(0.003))?;

    loop {
        // Fetch the pool price every 10 seconds
        //tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

        while let Some(msg) = rx.recv().await {
            log::info!("Received: {}", msg);

            if let Err(e) = fetcher.fetch_pool_price().await {
                log::error!("Error fetching pool price: {:?}", e);
            }
        }

    }

}