//! 认证门面：口令哈希（Argon2id）与会话令牌。
//!
//! 口令永远不回传前端；存储里只有 PHC 字符串
//! （`$argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>`），换参数时能识别旧记录。

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rand::RngCore;

pub fn hash_password(password: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .expect("argon2 哈希失败")
        .to_string()
}

pub fn verify(password: &str, phc: &str) -> bool {
    match PasswordHash::new(phc) {
        Ok(parsed) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

/// 32 字节 OS 随机 → 64 位十六进制（会话 token / CSRF token）
pub fn token() -> String {
    let mut b = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut b);
    let mut s = String::with_capacity(64);
    for byte in b {
        s.push(char::from_digit((byte >> 4) as u32, 16).unwrap());
        s.push(char::from_digit((byte & 0x0f) as u32, 16).unwrap());
    }
    s
}

/// 常数时间比较：token 校验不按字节提前返回
pub fn ct_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.as_bytes().iter().zip(b.as_bytes()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_roundtrip() {
        let h = hash_password("rhine-admin-2026");
        assert!(h.starts_with("$argon2id$"));
        assert!(verify("rhine-admin-2026", &h));
        assert!(!verify("wrong", &h));
        assert!(!verify("x", "not-a-phc-string"));
    }

    #[test]
    fn tokens_are_random() {
        let a = token();
        let b = token();
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
        assert!(ct_eq(&a, &a));
        assert!(!ct_eq(&a, &b));
    }
}
