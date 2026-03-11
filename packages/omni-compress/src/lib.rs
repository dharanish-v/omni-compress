use wasm_bindgen::prelude::*;
use photon_rs::native::open_image_from_bytes;
use photon_rs::transform::resize;
use std::io::Write;
use flate2::write::ZlibEncoder;
use flate2::Compression;

// This hooks up Rust panics to the browser console so you can see errors
#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn compress_image(file_bytes: &[u8], max_width: u32, quality: u8) -> Vec<u8> {
    // 1. Decode the image (handles PNG, JPG, BMP automatically)
    let img = open_image_from_bytes(file_bytes).expect("Failed to open image");
    
    let width = img.get_width();
    let height = img.get_height();
    let mut final_img = img;

    // 2. Resize Logic: Only if max_width is > 0 AND the image is actually larger
    if max_width > 0 && width > max_width {
        let new_height = (height as f64 * (max_width as f64 / width as f64)) as u32;
        // Lanczos3 provides the sharpest downscaling
        final_img = resize(&final_img, max_width, new_height, photon_rs::transform::SamplingFilter::Lanczos3);
    }

    // 3. Encode and return raw JPEG bytes
    return final_img.get_bytes_jpeg(quality); 
}

#[wasm_bindgen]
pub fn compress_zlib(data: &[u8], level: u32) -> Result<Vec<u8>, JsValue> {
    let compression = Compression::new(level);
    let mut e = ZlibEncoder::new(Vec::new(), compression);
    match e.write_all(data) {
        Ok(_) => match e.finish() {
            Ok(compressed_data) => Ok(compressed_data),
            Err(e) => Err(JsValue::from_str(&format!("Failed to finish compression: {}", e))),
        },
        Err(e) => Err(JsValue::from_str(&format!("Failed to compress data: {}", e))),
    }
}
