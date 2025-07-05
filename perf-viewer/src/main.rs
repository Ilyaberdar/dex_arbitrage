use eframe::egui::{self, CentralPanel, ProgressBar, Color32};
use eframe::{App, Frame};
use serde::Deserialize;
use std::fs;

#[derive(Deserialize)]
struct LabelDurations {
    label: String,
    avg_ms: f64,
    last_ms: f64,
}

pub struct PerfApp {
    metrics: Vec<LabelDurations>,
}

impl App for PerfApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut Frame) {
        CentralPanel::default().show(ctx, |ui| {
            ui.heading("Performance Metrics");

            for metric in &self.metrics {
                ui.label(format!(
                    "{} | Avg: {:.2} ms | Last: {:.2} ms",
                    metric.label, metric.avg_ms, metric.last_ms
                ));

                let avg_color = if metric.avg_ms > 1000.0 {
                    Color32::RED
                } else if metric.avg_ms > 500.0 {
                    Color32::YELLOW
                } else {
                    Color32::from_rgb(100, 200, 255)
                };

                let last_color = if metric.last_ms > 1000.0 {
                    Color32::RED
                } else if metric.last_ms > 500.0 {
                    Color32::YELLOW
                } else {
                    Color32::from_rgb(100, 200, 255)
                };

                ui.add(
                    ProgressBar::new((metric.avg_ms / 3000.0).min(1.0) as f32)
                        .text("avg")
                        .fill(avg_color),
                );
                ui.add(
                    ProgressBar::new((metric.last_ms / 3000.0).min(1.0) as f32)
                        .text("last")
                        .fill(last_color),
                );
                ui.separator();
            }
        });
    }
}

fn main() -> eframe::Result<()> {
    let json = fs::read_to_string("perf_metrics.json").expect("Failed to read JSON file");
    let metrics: Vec<LabelDurations> =
        serde_json::from_str(&json).expect("Invalid JSON format");

    let options = eframe::NativeOptions::default();
    eframe::run_native(
        "Perf Viewer",
        options,
        Box::new(|_cc| Box::new(PerfApp { metrics })),
    )
}
