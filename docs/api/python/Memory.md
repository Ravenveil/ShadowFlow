# Memory API Reference

## Memory Backends

AgentGraph supports multiple memory backends for storing workflow state, agent data, and execution history.

## Base Memory Class

```python
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
from datetime import datetime

class MemoryBackend(ABC):
    """Base class for memory backends."""

    @abstractmethod
    async def save_state(self, key: str, value: Any, user_id: str, expires_in: Optional[int] = None) -> None:
        """Save state data."""
        pass

    @abstractmethod
    async def load_state(self, key: str, user_id: str) -> Optional[Any]:
        """Load state data."""
        pass

    @abstractmethod
    async def delete_state(self, key: str, user_id: str) -> bool:
        """Delete state data."""
        pass

    @abstractmethod
    async def list_states(self, user_id: str, pattern: Optional[str] = None) -> List[str]:
        """List all state keys for a user."""
        pass
```

## SQLiteMemory

SQLite-based memory backend, perfect for local development and single-node deployments.

### Constructor

```python
from agentgraph import SQLiteMemory

class SQLiteMemory(MemoryBackend):
    def __init__(self, db_path: str = "agentgraph.db", scope: str = "user")
```

#### Parameters

- **db_path** (str, optional): Path to SQLite database file. Defaults to "agentgraph.db".
- **scope** (str, optional): Memory scope ("user", "workspace", "global"). Defaults to "user".

### Example Usage

```python
from agentgraph import SQLiteMemory

# Initialize
memory = SQLiteMemory("my_workflows.db", scope="user")

# Save workflow state
await memory.save_state(
    key="workflow:123",
    value={
        "status": "running",
        "progress": 50,
        "current_agent": "researcher"
    },
    user_id="user123"
)

# Load workflow state
state = await memory.load_state("workflow:123", "user123")
if state:
    print(f"Workflow status: {state['status']}")

# Delete workflow state
deleted = await memory.delete_state("workflow:123", "user123")
```

### Methods

#### `save_state(key: str, value: Any, user_id: str, expires_in: Optional[int] = None)`

Saves state data to the database.

**Parameters:**
- **key** (str): Unique key for the state data
- **value** (Any): Data to save (must be JSON serializable)
- **user_id** (str): User identifier
- **expires_in** (int, optional): Expiration time in seconds

#### `load_state(key: str, user_id: str)`

Loads state data from the database.

**Parameters:**
- **key** (str): Key of the state to load
- **user_id** (str): User identifier

**Returns:** The saved data or None if not found

#### `delete_state(key: str, user_id: str)`

Deletes state data from the database.

**Parameters:**
- **key** (str): Key of the state to delete
- **user_id** (str): User identifier

**Returns:** True if deleted, False if not found

#### `list_states(user_id: str, pattern: Optional[str] = None)`

Lists all state keys for a user.

**Parameters:**
- **user_id** (str): User identifier
- **pattern** (str, optional): Pattern to filter keys (supports wildcards)

**Returns:** List of matching keys

#### `cleanup_expired()`

Removes expired state entries.

```python
await memory.cleanup_expired()
```

## RedisMemory

Redis-based memory backend for distributed systems and high-performance scenarios.

### Constructor

```python
from agentgraph import RedisMemory

class RedisMemory(MemoryBackend):
    def __init__(self, host: str = "localhost", port: int = 6379,
                 db: int = 0, password: Optional[str] = None,
                 scope: str = "user")
```

#### Parameters

- **host** (str, optional): Redis host. Defaults to "localhost".
- **port** (int, optional): Redis port. Defaults to 6379.
- **db** (int, optional): Redis database number. Defaults to 0.
- **password** (str, optional): Redis password.
- **scope** (str, optional): Memory scope. Defaults to "user".

### Example Usage

```python
from agentgraph import RedisMemory

# Initialize with Redis
memory = RedisMemory(
    host="redis.example.com",
    port=6379,
    password="your-password",
    scope="workspace"
)

# Use same methods as SQLiteMemory
await memory.save_state("cache:users:user123", data, "system")
```

## Memory Key Patterns

Use consistent key patterns for organized storage:

```
user:{user_id}:workflow:{workflow_id}    # Workflow state
user:{user_id}:agent:{agent_id}          # Agent data
user:{user_id}:cache:{key}               # Cache data
user:{user_id}:history:{date}            # Execution history
```

### Pattern Examples

```python
# Workflow states
await memory.save_state("user:123:workflow:456", workflow_data, "123")
await memory.save_state("user:123:workflow:789", workflow_data, "123")

# Agent data
await memory.save_state("user:123:agent:researcher", agent_data, "123")

# Cache
await memory.save_state("user:123:cache:search_results", cache_data, "123", expires_in=3600)
```

## Memory Scopes

### User Scope
Data is isolated to individual users.

```python
memory = SQLiteMemory(scope="user")
# Keys: user:{user_id}:{key}
```

### Workspace Scope
Data is shared within a workspace.

```python
memory = SQLiteMemory(scope="workspace")
# Keys: workspace:{workspace_id}:{key}
```

### Global Scope
Data is shared across all users.

```python
memory = SQLiteMemory(scope="global")
# Keys: global:{key}
```

## Performance Optimization

### Batch Operations

```python
# Batch save operations
await memory.save_batch([
    ("key1", value1, "user123"),
    ("key2", value2, "user123"),
    ("key3", value3, "user123")
])

# Batch load operations
values = await memory.load_batch([
    ("key1", "user123"),
    ("key2", "user123"),
    ("key3", "user123")
])
```

### Caching Layer

```python
from functools import lru_cache

class CachedMemory(MemoryBackend):
    def __init__(self, backend: MemoryBackend, cache_size: int = 1000):
        self.backend = backend
        self.cache = {}
        self.cache_size = cache_size

    async def save_state(self, key: str, value: Any, user_id: str, expires_in: Optional[int] = None):
        self.cache[f"{user_id}:{key}"] = value
        await self.backend.save_state(key, value, user_id, expires_in)

    async def load_state(self, key: str, user_id: str) -> Optional[Any]:
        cache_key = f"{user_id}:{key}"
        if cache_key in self.cache:
            return self.cache[cache_key]
        value = await self.backend.load_state(key, user_id)
        self.cache[cache_key] = value
        return value
```

## Memory Management

### Size Monitoring

```python
# Get memory usage
stats = await memory.get_stats()
print(f"Total keys: {stats['total_keys']}")
print(f"Total size: {stats['total_size']} bytes")
print(f"Keys per user: {stats['keys_per_user']}")

# Clean up old data
await memory.cleanup_old_data(days_old=30)
```

### Backup and Restore

```python
# Export all data
backup = await memory.export_all_data(user_id="user123")

# Restore data
await memory.import_all_data(backup, user_id="user123")
```

## Error Handling

```python
try:
    await memory.save_state("key", data, "user123")
except MemoryError as e:
    print(f"Memory error: {e}")
except ConnectionError:
    print("Connection to memory backend failed")
except TimeoutError:
    print("Memory operation timed out")
```

## Best Practices

1. **Key Management**: Use consistent naming conventions
2. **Data Size**: Keep individual data entries under 1MB
3. **Expiration**: Set appropriate TTLs for cache data
4. **Error Handling**: Implement retry logic for transient failures
5. **Monitoring**: Track memory usage and performance

```python
# Good example
memory = SQLiteMemory("app.db", scope="user")

# Use structured keys
workflow_key = f"user:{user_id}:workflow:{workflow_id}"
cache_key = f"user:{user_id}:cache:{cache_name}:{version}"

# Set expiration for cache data
await memory.save_state(cache_key, data, user_id, expires_in=3600)

# Cleanup regularly
await memory.cleanup_expired()
```