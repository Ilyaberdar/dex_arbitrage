use wasm_bindgen::prelude::*;
use js_sys::{Date, Array};
use serde::Serialize;
use std::collections::HashMap;

#[wasm_bindgen]
#[derive(Default)]
pub struct PerfMeter {
    start_times: HashMap<String, f64>,
    durations: HashMap<String, Vec<f64>>, // ms
}

#[derive(Serialize)]
struct LabelDurations {
    label: String,
    avg_ms: f64,
    last_ms: f64,
}

#[wasm_bindgen]
impl PerfMeter {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PerfMeter {
        PerfMeter {
            start_times: HashMap::new(),
            durations: HashMap::new(),
        }
    }

    pub fn start(&mut self, label: String) {
        let now = Date::now();
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
            .and_then(|d| d.last().copied())
            .unwrap_or(0.0)
    }

    pub fn get_avg(&self, label: String) -> f64 {
        self.durations
            .get(&label)
            .map(|vec| {
                let total: f64 = vec.iter().sum();
                total / vec.len() as f64
            })
            .unwrap_or(0.0)
    }

    pub fn reset(&mut self, label: String) {
        self.durations.remove(&label);
    }

    pub fn clear_all(&mut self) {
        self.start_times.clear();
        self.durations.clear();
    }

    pub fn export_to_json(&self) -> String {
        let results: Vec<LabelDurations> = self.durations.iter().map(|(label, durations)| {
            let total: f64 = durations.iter().sum();
            let avg = total / durations.len() as f64;
            let last = durations.last().copied().unwrap_or(0.0);
            LabelDurations {
                label: label.clone(),
                avg_ms: avg,
                last_ms: last,
            }
        }).collect();

        serde_json::to_string(&results).unwrap_or("[]".into())
    }

    pub fn get_all_labels(&self) -> Array {
        self.durations
            .keys()
            .map(|k| JsValue::from(k.clone()))
            .collect()
    }
}
