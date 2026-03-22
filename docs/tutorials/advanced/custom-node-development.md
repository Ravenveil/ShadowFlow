# Custom Node Development

Learn how to create custom nodes to extend AgentGraph's capabilities.

## Overview

Custom nodes allow you to:
- Integrate external APIs and services
- Implement custom business logic
- Create domain-specific functionality
- Reusable workflow components

## Prerequisites

- Completed [Your First Workflow](../getting-started/your-first-workflow.md)
- Read [Workflow Schema](../../WORKFLOW_SCHEMA.md)
- Basic knowledge of Python
- Understanding of YAML configuration

> Legacy Tutorial Note
>
> 旧的 [Creating Cooperative Agents](../multi-agent/creating-cooperative-agents.md) 教程主要反映历史 workflow 结构。
> 如果你当前要基于 Phase 1 主线扩展自定义节点，应优先以 canonical workflow schema 为准。

## Step 1: Understanding Node Types

AgentGraph supports several node types:

### 1. Agent Nodes
- Execute LLM-based reasoning
- Have prompts and tools
- Handle complex decision-making

### 2. Custom Nodes
- Execute custom code
- Can be any programming language
- Perfect for:
  - API calls
  - Data processing
  - File operations
  - External service integration

## Step 2: Creating a Simple Custom Node

Let's create a custom node that calculates statistics.

### Node Definition (stats.yaml)

```yaml
# stats.yaml
id: "statistics"
type: "custom"
category: "data-processing"

name:
  en: "Statistics Calculator"
  zh: "统计计算器"

description:
  en: "Calculate statistical metrics from numerical data"
  zh: "从数值数据计算统计指标"

icon: "📊"

inputs:
  - name: "data"
    type: "array"
    description: "Array of numbers"
    required: true
  - name: "metrics"
    type: "array"
    description: "Metrics to calculate"
    required: false
    default: ["mean", "median", "std"]

outputs:
  - name: "result"
    type: "object"
    description: "Calculated statistics"

configSchema:
  type: object
  properties:
    precision:
      type: integer
      description: "Decimal places for results"
      default: 2
    include_histogram:
      type: boolean
      description: "Include histogram data"
      default: false
```

### Node Implementation (stats.py)

```python
# stats.py
import statistics
import json
from typing import Dict, Any, List

class StatisticsCalculator:
    def __init__(self, config: Dict[str, Any]):
        self.config = config

    def calculate_mean(self, data: List[float]) -> float:
        """Calculate arithmetic mean"""
        return statistics.mean(data)

    def calculate_median(self, data: List[float]) -> float:
        """Calculate median value"""
        return statistics.median(data)

    def calculate_std(self, data: List[float]) -> float:
        """Calculate standard deviation"""
        if len(data) < 2:
            return 0.0
        return statistics.stdev(data)

    def calculate_percentiles(self, data: List[float], percentiles: List[float]) -> Dict[str, float]:
        """Calculate percentiles"""
        result = {}
        sorted_data = sorted(data)
        n = len(sorted_data)

        for p in percentiles:
            idx = (n - 1) * p / 100
            if idx.is_integer():
                result[f"p{int(p)}"] = sorted_data[int(idx)]
            else:
                lower = int(idx)
                upper = lower + 1
                if upper >= n:
                    result[f"p{int(p)}"] = sorted_data[lower]
                else:
                    weight = idx - lower
                    result[f"p{int(p)}"] = (
                        sorted_data[lower] * (1 - weight) +
                        sorted_data[upper] * weight
                    )
        return result

    def create_histogram(self, data: List[float], bins: int = 10) -> Dict[str, Any]:
        """Create histogram data"""
        if not data:
            return {"bins": [], "counts": []}

        min_val = min(data)
        max_val = max(data)

        if min_val == max_val:
            return {"bins": [min_val], "counts": [len(data)]}

        bin_width = (max_val - min_val) / bins
        bins_list = [min_val + i * bin_width for i in range(bins + 1)]
        counts = [0] * bins

        for value in data:
            bin_idx = min(int((value - min_val) / bin_width), bins - 1)
            counts[bin_idx] += 1

        return {
            "bins": bins_list,
            "counts": counts,
            "bin_width": bin_width
        }

    def execute(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Main execution method"""
        try:
            data = inputs["data"]
            metrics = inputs.get("metrics", ["mean", "median", "std"])
            precision = self.config.get("precision", 2)
            include_histogram = self.config.get("include_histogram", False)

            # Validate input
            if not isinstance(data, list):
                raise ValueError("Data must be an array")

            data = [float(x) for x in data]

            # Calculate requested metrics
            result = {}
            precision_factor = 10 ** precision

            if "mean" in metrics:
                result["mean"] = round(self.calculate_mean(data), precision)

            if "median" in metrics:
                result["median"] = round(self.calculate_median(data), precision)

            if "std" in metrics:
                result["standard_deviation"] = round(self.calculate_std(data), precision)

            if "min" in metrics:
                result["min"] = round(min(data), precision)

            if "max" in metrics:
                result["max"] = round(max(data), precision)

            if "count" in metrics:
                result["count"] = len(data)

            if "sum" in metrics:
                result["sum"] = round(sum(data), precision)

            # Percentiles
            percentile_metrics = [p for p in metrics if p.startswith("p")]
            if percentile_metrics:
                percentiles = [float(p[1:]) for p in percentile_metrics]
                percentiles_result = self.calculate_percentiles(data, percentiles)
                for k, v in percentiles_result.items():
                    result[k] = round(v, precision)

            # Histogram
            if include_histogram:
                result["histogram"] = self.create_histogram(data)

            return {
                "success": True,
                "result": result,
                "metadata": {
                    "data_points": len(data),
                    "metrics_calculated": len(metrics),
                    "precision": precision
                }
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "result": None
            }
```

### Node Registration

```python
# Register the node
from agentgraph import NodeRegistry

node_registry = NodeRegistry()
node_registry.register({
    "node": {
        "id": "statistics",
        "name": "Statistics Calculator",
        "inputs": [
            {"name": "data", "type": "array", "required": True},
            {"name": "metrics", "type": "array", "required": False}
        ],
        "outputs": [
            {"name": "result", "type": "object"}
        ]
    },
    "executor": StatisticsCalculator
})
```

## Step 3: Creating an API Integration Node

Let's create a custom node that calls an external API.

### API Node Definition (weather-api.yaml)

```yaml
# weather-api.yaml
id: "weather-api"
type: "custom"
category: "api-integration"

name:
  en: "Weather API"
  zh: "天气API"

description:
  en: "Get current weather data for a location"
  zh: "获取指定位置的天气数据"

icon: "🌤️"

inputs:
  - name: "location"
    type: "string"
    description: "City name or coordinates"
    required: true
  - name: "units"
    type: "string"
    description: "Temperature units (metric/imperial)"
    required: false
    default: "metric"

outputs:
  - name: "weather_data"
    type: "object"
    description: "Weather information"

configSchema:
  type: object
  properties:
    api_key:
      type: string
      description: "Weather API key"
      required: true
    base_url:
      type: string
      description: "API base URL"
      default: "https://api.openweathermap.org/data/2.5"
    timeout:
      type: integer
      description: "Request timeout in seconds"
      default: 30
```

### API Node Implementation (weather_api.py)

```python
# weather_api.py
import requests
import json
from typing import Dict, Any
from datetime import datetime

class WeatherAPI:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.api_key = config["api_key"]
        self.base_url = config.get("base_url", "https://api.openweathermap.org/data/2.5")
        self.timeout = config.get("timeout", 30)

    def get_weather(self, location: str, units: str = "metric") -> Dict[str, Any]:
        """Get current weather data"""
        try:
            # Build URL
            url = f"{self.base_url}/weather"
            params = {
                "q": location,
                "appid": self.api_key,
                "units": units
            }

            # Make request
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()

            data = response.json()

            # Format result
            result = {
                "location": {
                    "city": data["name"],
                    "country": data["sys"]["country"],
                    "coordinates": {
                        "lat": data["coord"]["lat"],
                        "lon": data["coord"]["lon"]
                    }
                },
                "weather": {
                    "condition": data["weather"][0]["main"],
                    "description": data["weather"][0]["description"],
                    "icon": data["weather"][0]["icon"]
                },
                "temperature": {
                    "current": data["main"]["temp"],
                    "feels_like": data["main"]["feels_like"],
                    "min": data["main"]["temp_min"],
                    "max": data["main"]["temp_max"]
                },
                "humidity": data["main"]["humidity"],
                "pressure": data["main"]["pressure"],
                "wind": {
                    "speed": data["wind"]["speed"],
                    "direction": data["wind"]["deg"]
                },
                "visibility": data.get("visibility", 0) / 1000,  # Convert to km
                "timestamp": datetime.now().isoformat(),
                "units": units
            }

            return {
                "success": True,
                "weather_data": result
            }

        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": f"API request failed: {str(e)}",
                "weather_data": None
            }
        except KeyError as e:
            return {
                "success": False,
                "error": f"Invalid API response: missing {str(e)}",
                "weather_data": None
            }

    def execute(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Main execution method"""
        location = inputs["location"]
        units = inputs.get("units", "metric")

        return self.get_weather(location, units)
```

## Step 4: Creating a File Processing Node

### File Node Definition (file-processor.yaml)

```yaml
# file-processor.yaml
id: "file-processor"
type: "custom"
category: "data-processing"

name:
  en: "File Processor"
  zh: "文件处理器"

description:
  en: "Process files (CSV, JSON, TXT) with various operations"
  zh: "处理各种格式文件（CSV、JSON、TXT）"

icon: "📁"

inputs:
  - name: "file_path"
    type: "string"
    description: "Path to the file"
    required: true
  - name: "operation"
    type: "string"
    description: "Operation to perform"
    required: true
    enum: ["read", "transform", "validate", "analyze"]
  - name: "options"
    type: "object"
    description: "Additional options for the operation"
    required: false

outputs:
  - name: "result"
    type: "object"
    description: "Processing result"

configSchema:
  type: object
  properties:
    encoding:
      type: string
      description: "File encoding"
      default: "utf-8"
    max_file_size:
      type: integer
      description: "Maximum file size in bytes"
      default: 10485760  # 10MB
    supported_formats:
      type: array
      items:
        type: string
      default: ["csv", "json", "txt", "xlsx"]
```

### File Node Implementation (file_processor.py)

```python
# file_processor.py
import os
import json
import csv
import pandas as pd
from typing import Dict, Any, List
import chardet

class FileProcessor:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.encoding = config.get("encoding", "utf-8")
        self.max_file_size = config.get("max_file_size", 10485760)
        self.supported_formats = config.get("supported_formats", ["csv", "json", "txt", "xlsx"])

    def detect_encoding(self, file_path: str) -> str:
        """Detect file encoding"""
        with open(file_path, 'rb') as f:
            result = chardet.detect(f.read())
        return result['encoding'] or 'utf-8'

    def validate_file(self, file_path: str) -> Dict[str, Any]:
        """Validate file"""
        try:
            # Check if file exists
            if not os.path.exists(file_path):
                return {
                    "success": False,
                    "error": "File not found",
                    "result": None
                }

            # Check file size
            file_size = os.path.getsize(file_path)
            if file_size > self.max_file_size:
                return {
                    "success": False,
                    "error": f"File size exceeds limit ({file_size} > {self.max_file_size})",
                    "result": None
                }

            # Check file extension
            _, ext = os.path.splitext(file_path)
            ext = ext[1:].lower()
            if ext not in self.supported_formats:
                return {
                    "success": False,
                    "error": f"Unsupported file format: {ext}",
                    "result": None
                }

            return {
                "success": True,
                "result": {
                    "file_size": file_size,
                    "file_format": ext,
                    "encoding": self.detect_encoding(file_path)
                }
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "result": None
            }

    def read_file(self, file_path: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """Read file contents"""
        validation = self.validate_file(file_path)
        if not validation["success"]:
            return validation

        try:
            _, ext = os.path.splitext(file_path)
            ext = ext[1:].lower()
            options = options or {}

            if ext == "csv":
                # Read CSV
                delimiter = options.get("delimiter", ",")
                df = pd.read_csv(file_path, delimiter=delimiter)
                result = {
                    "data": df.to_dict("records"),
                    "columns": list(df.columns),
                    "rows": len(df),
                    "summary": df.describe().to_dict()
                }
            elif ext == "json":
                # Read JSON
                with open(file_path, 'r', encoding=self.encoding) as f:
                    data = json.load(f)
                result = {
                    "data": data,
                    "type": type(data).__name__,
                    "size": len(data) if isinstance(data, (list, dict)) else 0
                }
            else:
                # Read text file
                with open(file_path, 'r', encoding=self.encoding) as f:
                    content = f.read()
                result = {
                    "content": content,
                    "lines": len(content.splitlines()),
                    "words": len(content.split()),
                    "characters": len(content)
                }

            return {
                "success": True,
                "result": result
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "result": None
            }

    def transform_file(self, file_path: str, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """Transform file data"""
        # Similar implementation for transformation
        pass

    def execute(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Main execution method"""
        file_path = inputs["file_path"]
        operation = inputs["operation"]
        options = inputs.get("options", {})

        if operation == "read":
            return self.read_file(file_path, options)
        elif operation == "validate":
            return self.validate_file(file_path)
        elif operation == "transform":
            return self.transform_file(file_path, options)
        else:
            return {
                "success": False,
                "error": f"Unsupported operation: {operation}",
                "result": None
            }
```

## Step 5: Testing Custom Nodes

### Test Script (test_nodes.py)

```python
# test_nodes.py
import yaml
from stats import StatisticsCalculator
from weather_api import WeatherAPI
from file_processor import FileProcessor

def test_statistics_node():
    """Test statistics node"""
    config = {"precision": 2, "include_histogram": False}
    calculator = StatisticsCalculator(config)

    inputs = {
        "data": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        "metrics": ["mean", "median", "std", "min", "max"]
    }

    result = calculator.execute(inputs)
    print("Statistics Test:")
    print(f"Success: {result['success']}")
    print(f"Result: {result['result']}")

def test_weather_node():
    """Test weather node"""
    config = {
        "api_key": "YOUR_API_KEY",
        "timeout": 10
    }
    weather = WeatherAPI(config)

    inputs = {
        "location": "London",
        "units": "metric"
    }

    result = weather.execute(inputs)
    print("\nWeather Test:")
    print(f"Success: {result['success']}")
    if result['success']:
        print(f"Temperature: {result['weather_data']['temperature']['current']}°C")

def test_file_node():
    """Test file node"""
    config = {
        "encoding": "utf-8",
        "max_file_size": 10485760
    }
    processor = FileProcessor(config)

    # Create a test CSV file
    test_data = [
        {"name": "Alice", "age": 25, "city": "New York"},
        {"name": "Bob", "age": 30, "city": "Chicago"},
        {"name": "Charlie", "age": 35, "city": "San Francisco"}
    ]

    import csv
    with open("test.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "age", "city"])
        writer.writeheader()
        writer.writerows(test_data)

    inputs = {
        "file_path": "test.csv",
        "operation": "read"
    }

    result = processor.execute(inputs)
    print("\nFile Test:")
    print(f"Success: {result['success']}")
    if result['success']:
        print(f"Rows: {result['result']['rows']}")
        print(f"Columns: {result['result']['columns']}")

if __name__ == "__main__":
    test_statistics_node()
    test_weather_node()
    test_file_node()
```

## Best Practices

### 1. Node Design
- Keep nodes focused on a single responsibility
- Provide clear input/output schemas
- Handle errors gracefully
- Document your code

### 2. Performance
- Implement caching where appropriate
- Set reasonable timeouts
- Validate inputs early
- Use async operations for I/O

### 3. Security
- Validate all inputs
- Sanitize file paths
- Use API keys securely
- Handle sensitive data carefully

### 4. Testing
- Write unit tests
- Test error cases
- Document test requirements
- Use test data sets

## Next Steps

- [Node Packaging and Distribution](packaging-nodes.md)
- [Advanced Error Handling](error-handling.md)
- [Performance Optimization](performance.md)
