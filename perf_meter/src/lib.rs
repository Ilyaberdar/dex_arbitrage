use wasm_bindgen::prelude::*;
use js_sys::Date;

#[wasm_bindgen]
pub struct PerfMeter {
    start_times: std::collections::HashMap<String, f64>,
    durations: std::collections::HashMap<String, Vec<f64>>,
}

#[wasm_bindgen]
impl PerfMeter {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PerfMeter {
        PerfMeter {
            start_times: std::collections::HashMap::new(),
            durations: std::collections::HashMap::new(),
        }
    }

    pub fn start(&mut self, label: String) {
        let now = Date::now(); // returns milliseconds since epoch
        self.start_times.insert(label, now);
    }

    pub fn stop(&mut self, label: String) {
        if let Some(start_time) = self.start_times.remove(&label) {
            let now = Date::now();
            let duration = now - start_time;
            self.durations.entry(label).or_default().push(duration);
        }
    }

    pub fn get_last(&self, label: String) -> f64 {
        self.durations
            .get(&label)
            .and_then(|v| v.last().copied())
            .unwrap_or(0.0)
    }

    pub fn get_avg(&self, label: String) -> f64 {
        if let Some(durations) = self.durations.get(&label) {
            let total: f64 = durations.iter().sum();
            total / durations.len() as f64
        } else {
            0.0
        }
    }
}
