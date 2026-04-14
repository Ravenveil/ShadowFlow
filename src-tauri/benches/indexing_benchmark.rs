use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use tempfile::tempdir;
use std::fs;
use std::path::Path;
use shadowflow::knowledge_base::KnowledgeBase;
use shadowflow::config::AppConfig;

fn indexing_benchmark(c: &mut Criterion) {
    let mut group = c.benchmark_group("KnowledgeBase Indexing");

    // 测试不同文件数量的性能
    for file_count in [10, 50, 100, 500] {
        let dir = tempdir().unwrap();
        let kb_path = dir.path();

        // 创建测试文件
        for i in 0..file_count {
            let file_path = kb_path.join(format!("file_{}.md", i));
            let content = generate_markdown_content(i);
            fs::write(&file_path, content).unwrap();
        }

        // 禁用日志以避免 benchmark 干扰
        std::env::set_var("RUST_LOG", "off");

        group.bench_with_input(BenchmarkId::new("index_files", file_count), file_count, |b, _| {
            let mut kb = KnowledgeBase::new();
            kb.open(kb_path).unwrap();

            b.iter(|| {
                // 重置知识库以重新索引
                kb.close();
                kb.open(kb_path).unwrap();

                // 索引所有文件
                match kb.index_all() {
                    Ok(count) => black_box(count),
                    Err(e) => panic!("索引失败: {}", e),
                }
            });
        });
    }

    group.finish();
}

fn generate_markdown_content(index: usize) -> String {
    let title = format!("测试文档 {}", index);
    let tags = ["技术", "文档", "研究", "分析", "总结"];
    let tag = tags[index % tags.len()];

    format!(
        r#"# {}

这是第 {} 个测试文档。

内容要点：
1. 主要概念阐述
2. 详细分析
3. 结论总结

## 相关内容

相关文档：[[文档 {}]]
标签：#{}

## 参考链接

- [参考链接 1](https://example.com/1)
- [参考链接 2](https://example.com/2)
- [参考链接 3](https://example.com/3)

---

本文档的创建时间是：2024-01-01T00:00:00Z
"#,
        title,
        index,
        (index + 1) % 100, // 生成相关文档引用
        tag
    )
}

fn concurrent_indexing_benchmark(c: &mut Criterion) {
    let mut group = c.benchmark_group("Concurrent Indexing");

    // 测试不同并发级别的性能
    for concurrent in [1, 2, 4, 8] {
        group.bench_with_input(
            BenchmarkId::new("concurrent_tasks", concurrent),
            concurrent,
            |b, _| {
                let kb_path = tempdir().unwrap().path();

                b.iter(|| {
                    let rt = tokio::runtime::Runtime::new().unwrap();

                    rt.block_on(async {
                        let mut handles = vec![];

                        for i in 0..*concurrent {
                            let path = kb_path.join(format!("file_{}.md", i));
                            let content = generate_markdown_content(i);
                            fs::write(&path, content).unwrap();

                            let kb = KnowledgeBase::new();
                            let path_clone = path.clone();

                            let handle = tokio::spawn(async move {
                                kb.index_file(&path_clone)
                            });

                            handles.push(handle);
                        }

                        for handle in handles {
                            match handle.await {
                                Ok(Ok(_)) => black_box(()),
                                Ok(Err(e)) => panic!("索引失败: {}", e),
                                Err(e) => panic!("任务失败: {}", e),
                            }
                        }
                    });
                });
            },
        );
    }

    group.finish();
}

criterion_group!(benches, indexing_benchmark, concurrent_indexing_benchmark);
criterion_main!(benches);