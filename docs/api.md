# MeetingSearch API

面向开发者的 HTTP 接口文档。服务默认运行在 `http://localhost:3000`，所有接口均为 `application/json`。

## 通用错误

| 状态码 | 说明 |
|---|---|
| `400` | 请求体不是合法 JSON，或字段缺失 / 非法 |
| `404` | 路由不存在；搜索时表示空候选集合（见下文） |
| `413` | 请求体超过 1 MB |
| `500` | 服务内部错误 |
| `502` | 地图服务（高德）调用失败 |

## `POST /api/geocode`

把自由文本地址解析成零个、一个或多个候选地点。

请求：

```json
{ "address": "望京" }
```

响应 `200`：

```json
{
  "candidates": [
    {
      "formattedAddress": "北京市朝阳区望京街",
      "coordinates": { "lat": 39.99, "lng": 116.47 }
    }
  ]
}
```

候选数量含义：

- 0 个：地址无法解析；
- 1 个：可以直接使用；
- 多个：需要用户选择其中一个。

相同地址的查询结果会在内存中缓存 5 分钟；切换地图服务配置时缓存自动清空。

## `POST /api/search`

对某个品牌的门店候选集合按目标排序。参与者必须已经有解析好的坐标（先调用 `/api/geocode`）。

请求：

```json
{
  "participants": [
    { "id": "p1", "label": "Haidian", "coordinates": { "lat": 39.98, "lng": 116.32 } },
    { "id": "p2", "label": "Wangjing", "coordinates": { "lat": 39.99, "lng": 116.47 } }
  ],
  "brand": "滨寿司",
  "objective": "total_distance",
  "radiusMeters": 15000,
  "concurrency": 3
}
```

字段说明：

| 字段 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `participants` | 是 | — | 至少 2 人；每项含 `id`、`label` 和 `coordinates` |
| `brand` | 是 | — | 品牌名称（如 `滨寿司`） |
| `objective` | 是 | — | `total_distance`（总路程最短）或 `minimax`（最远的人路程最短） |
| `radiusMeters` | 否 | `15000` | 搜索半径（米） |
| `concurrency` | 否 | `3` | 并行的地图请求数上限，与 `AMAP_QPS` 限速相互独立 |

响应 `200`（排名结果）：

```json
{
  "objective": "total_distance",
  "entries": [
    {
      "branch": {
        "id": "B000A8XXXX",
        "name": "滨寿司·望京店",
        "address": "朝阳区望京街2号",
        "coordinates": { "lat": 39.99, "lng": 116.48 }
      },
      "distances": { "p1": 12500, "p2": 1500 },
      "score": 14000
    }
  ],
  "recommendation": {
    "branch": {
      "id": "B000A8XXXX",
      "name": "滨寿司·望京店",
      "address": "朝阳区望京街2号",
      "coordinates": { "lat": 39.99, "lng": 116.48 }
    },
    "distances": { "p1": 12500, "p2": 1500 },
    "score": 14000
  }
}
```

`entries` 按分数升序排列，`score` 在 `total_distance` 下是所有距离之和，在 `minimax` 下是最大距离；`recommendation` 是第一名。

错误响应：

| 状态码 | 响应体 | 含义 |
|---|---|---|
| `404` | `{ "kind": "empty_candidate_set", "message": "…" }` | 半径内没有找到该品牌的门店，建议调大半径或换品牌 |
| `502` | `{ "kind": "map_provider_error", "message": "…" }` | 高德密钥 / HTTP / 配置等外部服务失败 |
| `4xx` | `{ "error": "…" }` | 请求本身不合法（如缺少品牌、参与者少于 2 人） |

## `GET /api/service-settings`

返回当前各密钥是否已配置，以及生效中的 QPS：

```json
{
  "amapKey": { "configured": true },
  "amapJsKey": { "configured": true },
  "amapSecurityJsCode": { "configured": false },
  "amapQps": 3
}
```

## `PUT /api/service-settings`

更新地图服务配置，立即热替换当前服务（无需重启），并把变更写入本地 `.env` 文件。

请求示例：

```json
{
  "amapKey": "your-web-service-key",
  "amapJsKey": "your-js-api-key",
  "amapSecurityJsCode": "your-security-code",
  "amapQps": 3
}
```

支持字段：

| 字段 | 说明 |
|---|---|
| `amapKey` / `amapJsKey` / `amapSecurityJsCode` | 设置对应密钥；传空字符串且不设 clear 标志时保持现值不变 |
| `clearAmapKey` / `clearAmapJsKey` / `clearAmapSecurityJsCode` | `true` 时清空对应密钥（会切回演示模式或禁用网页地图） |
| `amapQps` | 正整数，更新每秒请求上限 |

响应 `200` 返回更新后的状态，并带 `reloadRequired` 字段：`true` 表示 JS 地图密钥有变化，需要刷新页面才能生效。
