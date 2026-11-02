//! RhineLab Console · 核心领域层
//!
//! 两端（W 端 Tauri / L 端 agent）共用这一层：
//! 同一份模型、同一份存储、同一套认证语义 —— 所以"L 端业务面与 W 端业务面无异"
//! 不是靠复制代码，而是靠共用 crate。
//!
//! 分层：
//! ```text
//! model  纯数据结构（可序列化，前端直接消费）
//! auth   Argon2 口令 + 随机令牌
//! store  状态 + 持久化（JSON 文件；边界已收拢，可换 SQLite）
//! ```
pub mod auth;
pub mod model;
pub mod store;

pub use model::*;
pub use store::{now_ms, AuthUser, Error, Result, Store};
