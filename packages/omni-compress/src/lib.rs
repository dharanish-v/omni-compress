use wasm_bindgen::prelude::*;
use photon_rs::native::open_image_from_bytes;
use photon_rs::transform::resize;
use std::io::Write;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use flacenc::component::BitRepr;
use flacenc::source::MemSource;
use flacenc::bitsink::MemSink;
use shine_rs::{Mp3EncoderConfig, Mp3Encoder, StereoMode};

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

#[wasm_bindgen]
pub fn compress_to_flac(pcm_data: &[f32], sample_rate: u32, channels: u32, bits_per_sample: u32) -> Result<Vec<u8>, JsValue> {
    // Convert f32 PCM to i32 PCM for flacenc
    let multiplier = (1 << (bits_per_sample - 1)) as f32;
    let i32_samples: Vec<i32> = pcm_data.iter().map(|&s| (s * multiplier) as i32).collect();

    let config = flacenc::config::Encoder::default();
    let source = MemSource::from_samples(&i32_samples, channels as usize, bits_per_sample as usize, sample_rate as usize);
    
    let flac_stream = flacenc::encode_with_fixed_block_size(&config, source, 4096)
        .map_err(|e| JsValue::from_str(&format!("FLAC encoding failed: {:?}", e)))?;

    let mut sink = MemSink::<u8>::new();
    flac_stream.write(&mut sink).map_err(|_| JsValue::from_str("Failed to write FLAC stream"))?;
    
    Ok(sink.into_inner())
}

#[wasm_bindgen]
pub fn compress_to_mp3(pcm_data: &[f32], sample_rate: u32, channels: u32, bitrate: u32) -> Result<Vec<u8>, JsValue> {
    let stereo_mode = if channels == 1 { StereoMode::Mono } else { StereoMode::Stereo };
    let config = Mp3EncoderConfig {
        sample_rate,
        bitrate,
        channels: channels as u8,
        stereo_mode,
        copyright: false,
        original: true,
    };

    let mut encoder = Mp3Encoder::new(config)
        .map_err(|e| JsValue::from_str(&format!("Failed to create MP3 encoder: {:?}", e)))?;

    // Web Audio API decodeAudioData provides interleaved samples
    // Shine-rs uses 16-bit integers
    let i16_samples: Vec<i16> = pcm_data.iter().map(|&s| (s * 32767.0) as i16).collect();
    
    let frames = encoder.encode_interleaved(&i16_samples)
        .map_err(|e| JsValue::from_str(&format!("MP3 encoding failed: {:?}", e)))?;

    let mut mp3_data = Vec::new();
    for frame in frames {
        mp3_data.extend(frame);
    }
    
    let final_data = encoder.finish()
        .map_err(|e| JsValue::from_str(&format!("Failed to finish MP3 encoding: {:?}", e)))?;
    mp3_data.extend(final_data);

    Ok(mp3_data)
}
