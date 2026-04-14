use crate::config::AppConfig;
use crate::error::ShadowError;
use reqwest::{Client, RequestBuilder, Response};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::time::sleep;

/// HTTP API 客户端管理器
pub struct HttpClient {
    client: Client,
    config: AppConfig,
}

impl HttpClient {
    /// 创建新的 HTTP 客户端
    pub fn new(config: AppConfig) -> Result<Self, ShadowError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.http_api.timeout_secs))
            .user_agent("ShadowFlow/0.1.0")
            .build()?;

        Ok(Self { client, config })
    }

    /// 发送 GET 请求
    pub async fn get(&self, path: &str) -> Result<Response, ShadowError> {
        let url = self.build_url(path);
        let mut request = self.client.get(&url);

        request = self.add_auth(request);

        self.execute_with_retry(request).await
    }

    /// 发送 POST 请求
    pub async fn post<T: Serialize>(&self, path: &str, data: T) -> Result<Response, ShadowError> {
        let url = self.build_url(path);
        let mut request = self.client.post(&url).json(&data);

        request = self.add_auth(request);

        self.execute_with_retry(request).await
    }

    /// 发送 PUT 请求
    pub async fn put<T: Serialize>(&self, path: &str, data: T) -> Result<Response, ShadowError> {
        let url = self.build_url(path);
        let mut request = self.client.put(&url).json(&data);

        request = self.add_auth(request);

        self.execute_with_retry(request).await
    }

    /// 发送 DELETE 请求
    pub async fn delete(&self, path: &str) -> Result<Response, ShadowError> {
        let url = self.build_url(path);
        let mut request = self.client.delete(&url);

        request = self.add_auth(request);

        self.execute_with_retry(request).await
    }

    /// 构建完整 URL
    fn build_url(&self, path: &str) -> String {
        if path.starts_with("http://") || path.starts_with("https://") {
            path.to_string()
        } else {
            format!("{}{}", self.config.http_api.base_url.trim_end_matches('/'), path)
        }
    }

    /// 添加认证头
    fn add_auth(&self, mut request: RequestBuilder) -> RequestBuilder {
        if let Some(ref token) = self.config.http_api.auth_token {
            request = request.header("Authorization", format!("Bearer {}", token));
        }
        request
    }

    /// 执行请求，支持重试机制
    async fn execute_with_retry(&self, mut request: RequestBuilder) -> Result<Response, ShadowError> {
        let attempts = self.config.http_api.retry_attempts;
        let delay_ms = self.config.http_api.retry_delay_ms;

        for attempt in 0..=attempts {
            match request.try_clone().unwrap().send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        return Ok(response);
                    } else if response.status().is_server_error() {
                        // 服务器错误，重试
                        log::warn!("服务器错误: {}", response.status());
                        if attempt < attempts {
                            sleep(Duration::from_millis(delay_ms)).await;
                            continue;
                        }
                    }
                    // 返回错误响应
                    let status = response.status();
                    let error_text = response.text().await?;
                    return Err(ShadowError::HttpError(format!(
                        "HTTP 请求失败: {} - {}",
                        status,
                        error_text
                    )));
                }
                Err(e) => {
                    if attempt < attempts {
                        log::warn!("请求失败，重试中: {}", e);
                        sleep(Duration::from_millis(delay_ms)).await;
                        continue;
                    }
                    return Err(ShadowError::HttpError(e.to_string()));
                }
            }
        }

        unreachable!()
    }
}

/// API 响应格式
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
    pub message: Option<String>,
}

impl<T> ApiResponse<T> {
    /// 创建成功的响应
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
            message: None,
        }
    }

    /// 创建失败的响应
    pub fn error(error: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
            message: None,
        }
    }

    /// 创建带消息的响应
    pub fn message(message: String) -> Self {
        Self {
            success: true,
            data: None,
            error: None,
            message: Some(message),
        }
    }

    /// 检查响应是否成功
    pub fn is_success(&self) -> bool {
        self.success
    }

    /// 获取数据，如果失败则返回错误
    pub fn get_data(self) -> Result<T, String> {
        if self.success {
            self.data.ok_or_else(|| "响应数据为空".to_string())
        } else {
            Err(self.error.unwrap_or_else(|| "未知错误".to_string()))
        }
    }
}

/// API 错误类型
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("HTTP 错误: {0}")]
    Http(String),

    #[error("序列化错误: {0}")]
    Serialize(String),

    #[error("认证失败")]
    AuthFailed,

    #[error("API 不可用")]
    ServiceUnavailable,

    #[error("请求超时")]
    Timeout,
}

impl From<ShadowError> for ApiError {
    fn from(err: ShadowError) -> Self {
        match err {
            ShadowError::HttpError(e) => ApiError::Http(e),
            ShadowError::Serde(e) => ApiError::Serialize(e.to_string()),
            _ => ApiError::Http(err.to_string()),
        }
    }
}

/// API 端点配置
pub struct ApiEndpoint {
    pub path: String,
    pub method: String,
    pub requires_auth: bool,
}

impl ApiEndpoint {
    /// 创建新的 API 端点
    pub fn new(path: String, method: String, requires_auth: bool) -> Self {
        Self {
            path,
            method,
            requires_auth,
        }
    }

    /// 创建 GET 端点
    pub fn get(path: String) -> Self {
        Self::new(path, "GET".to_string(), false)
    }

    /// 创建 POST 端点
    pub fn post(path: String) -> Self {
        Self::new(path, "POST".to_string(), true)
    }

    /// 创建 PUT 端点
    pub fn put(path: String) -> Self {
        Self::new(path, "PUT".to_string(), true)
    }

    /// 创建 DELETE 端点
    pub fn delete(path: String) -> Self {
        Self::new(path, "DELETE".to_string(), true)
    }
}

/// API 管理器
pub struct ApiManager {
    client: HttpClient,
    endpoints: std::collections::HashMap<String, ApiEndpoint>,
}

impl ApiManager {
    /// 创建新的 API 管理器
    pub fn new(config: AppConfig) -> Result<Self, ShadowError> {
        let client = HttpClient::new(config)?;
        let mut endpoints = std::collections::HashMap::new();

        // 注册默认 API 端点
        endpoints.insert(
            "ping".to_string(),
            ApiEndpoint::get("/api/v1/ping".to_string()),
        );
        endpoints.insert(
            "health".to_string(),
            ApiEndpoint::get("/api/v1/health".to_string()),
        );
        endpoints.insert(
            "search".to_string(),
            ApiEndpoint::post("/api/v1/search".to_string()),
        );
        endpoints.insert(
            "sync".to_string(),
            ApiEndpoint::post("/api/v1/sync".to_string()),
        );

        Ok(Self { client, endpoints })
    }

    /// 获取端点
    pub fn get_endpoint(&self, name: &str) -> Option<&ApiEndpoint> {
        self.endpoints.get(name)
    }

    /// 注册新端点
    pub fn register_endpoint(&mut self, name: String, endpoint: ApiEndpoint) {
        self.endpoints.insert(name, endpoint);
    }

    /// 调用 API
    pub async fn call<T: Serialize, R: for<'de> serde::Deserialize<'de>>(
        &self,
        endpoint_name: &str,
        data: Option<T>,
    ) -> Result<ApiResponse<R>, ShadowError> {
        let endpoint = self
            .endpoints
            .get(endpoint_name)
            .ok_or_else(|| ShadowError::ApiEndpointNotFound(endpoint_name.to_string()))?;

        let response = match endpoint.method.as_str() {
            "GET" => {
                if let Some(_) = data {
                    log::warn!("GET 请求不应包含数据");
                }
                self.client.get(&endpoint.path).await?
            }
            "POST" => {
                if let Some(data) = data {
                    self.client.post(&endpoint.path, data).await?
                } else {
                    self.client.post(&endpoint.path, ()).await?
                }
            }
            "PUT" => {
                if let Some(data) = data {
                    self.client.put(&endpoint.path, data).await?
                } else {
                    self.client.put(&endpoint.path, ()).await?
                }
            }
            "DELETE" => {
                if let Some(_) = data {
                    log::warn!("DELETE 请求不应包含数据");
                }
                self.client.delete(&endpoint.path).await?
            }
            _ => {
                return Err(ShadowError::ApiEndpointNotFound(
                    format!("不支持的 HTTP 方法: {}", endpoint.method),
                ))
            }
        };

        let status = response.status();
        if status.is_success() {
            let data: ApiResponse<R> = response.json().await?;
            Ok(data)
        } else {
            let error_text = response.text().await?;
            Err(ShadowError::HttpError(format!(
                "HTTP 请求失败: {} - {}",
                status,
                error_text
            )))
        }
    }

    /// 健康检查
    pub async fn health_check(&self) -> Result<(), ShadowError> {
        let response = self.client.get("/api/v1/health").await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let error_text = response.text().await?;
            Err(ShadowError::HttpError(format!(
                "健康检查失败: {}",
                error_text
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_http_client_creation() {
        let config = AppConfig::default();
        let client = HttpClient::new(config);
        assert!(client.is_ok());
    }

    #[tokio::test]
    async fn test_api_endpoint_creation() {
        let endpoint = ApiEndpoint::get("/test".to_string());
        assert_eq!(endpoint.method, "GET");
        assert_eq!(endpoint.path, "/test");
        assert!(!endpoint.requires_auth);
    }

    #[tokio::test]
    async fn test_api_response() {
        let response = ApiResponse::<String>::success("test data".to_string());
        assert!(response.is_success());
        assert_eq!(response.get_data().unwrap(), "test data");
    }
}