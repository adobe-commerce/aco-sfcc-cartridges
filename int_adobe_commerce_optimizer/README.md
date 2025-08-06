# Adobe Commerce Optimizer Integration Cartridge

An Adobe Commerce Optimizer (ACO) integration cartridge for Salesforce Commerce Cloud (SFCC) that provides custom SCAPI endpoints for accessing price books and product data as well as a custom job to track changes made to product, price book, and price entities from SFCC.

**Important Note:** [Delta Exports](https://help.salesforce.com/s/articleView?language=en_US&id=cc.b2c_delta_exports.htm&type=5) functionality is required to be enabled in order for ACO to pick up changes made to SFCC entities. You may need to contact Salesforce support to enabled **Delta Exports** on your instance if it is not already.

This custom SFCC Cartridge is required to enable functionality in the [ACO SFCC Starter Kit](https://github.com/adobe-commerce/aco-sfcc-starter-kit).

## Starter Kit Workflow

![ACO SFCC Starter Kit Diagram](/docs/images/starter_kit_diagram.png)

## ACO Tracked Changes Job

The `AdobeCommerceOptimizerTrackedChanges` job (defined in [metadata/jobs.xml](/metadata/jobs.xml)) detects changes made to product, price book, and price objects in SFCC (made from Business Manager, imports, etc) and tracks their state in a Custom Object Type: `AcoTrackedChanges`. This is required for the ACO SFCC Starter Kit to be able to identify critical data changes and ingest them into your Adobe Commerce Optimizer environment.

This custom job is based upon and requires the SFCC [Delta Exports](https://help.salesforce.com/s/articleView?language=en_US&id=cc.b2c_delta_exports.htm&type=5) functionality to be enabled.

### Job Logic

1. Parse Delta Export zip files (specifically catalog and pricebook files).
2. Identify the IDs of the objects that appear in the Delta Export files.
3. Save the object identifiers and type of change made to these objects in a new SFCC Custom Object, AcoTrackedChanges.
4. This new custom object can be queried via our Get ACO Tracked Changes Custom SCAPI endpoint described below.

### AcoTrackedChanges Object Schema

The `AcoTrackedChanges` custom object keeps track of the latest state of product, price book, and price objects. Its structure is the following:

- `id`: Unique object id (`{entityId}\_{siteId}).
- `entityId`: The identifier of the changed object (represents the `productId` or `priceBookId`).
- `siteId`: The SFCC site where these changes were detected.
- `type`: The type of object that was changed (can be `product`, `priceBook`, or `price`).
- `isDeleted`: Indicates if the object was deleted in its last change.
- `lastModified`: The timestamp of the last detected change. This will correspond with the timestamp of the `AdobeCommerceOptimizerTrackedChanges` that detected the change.

This job is required to enable the functionality of the `getAcoTrackedChanges` custom SCAPI endpoint which is used by the ACO SFCC Starter Kit to perform delta-sync operations.

## API Endpoints

### 1. Get Site Catalog

- **Endpoint**: `GET /catalog`
- **Operation ID**: `getSiteCatalog`
- **Description**: Get information about the catalog assigned to the given site.
- **Parameters**:
  - `siteId` (required): The site ID
- **Authentication**: AmOAuth2 with `c_aco` scope
- **Response**: Returns details about the catalog that is assigned to the provided `siteId`.

### 2. Get All Price Books

- **Endpoint**: `GET /pricebooks`
- **Operation ID**: `getAllPriceBooks`
- **Description**: Retrieves all price books
- **Parameters**:
  - `siteId` (required): The site ID
  - `c_limit`: Maximum number of price books to return per request.
  - `c_offset`: The zero-based index of the first price book to include in the result.
- **Authentication**: AmOAuth2 with `c_aco` scope
- **Response**: Returns a list of price books with details including ID, display name, currency, online status, and parent price book relationships.

### 3. Get Price Book By ID

- **Endpoint**: `GET /pricebooks/{priceBookId}`
- **Operation ID**: `getPriceBooks`
- **Description**: Retrieves a price book by its ID
- **Parameters**:
  - `siteId` (required): The site ID
- **Authentication**: AmOAuth2 with `c_aco` scope
- **Response**: Returns the requested price book with details including ID, display name, currency, online status, and parent price book relationships.

### 4. Get Products

- **Endpoint**: `POST /products`
- **Operation ID**: `getProducts`
- **Description**: Retrieves detailed product information for specified product IDs
- **Parameters**:
  - `siteId` (required): The site ID
  - `locale` (required): The locale for localized product information
- **Request Body**: JSON object containing an array of product IDs (max 100)
- **Authentication**: AmOAuth2 with `c_aco` scope
- **Response**: Returns detailed product information including prices per price book, attributes, images, and metadata.

### 4. Get ACO Tracked Changes

- **Endpoint**: `GET /changes`
- **Operation ID**: `getAcoTrackedChanges`
- **Description**: Retrieves detailed product information for specified product IDs
- **Parameters**:
  - `siteId` (required): The site ID
  - `c_limit`: Maximum number of change records to return per request.
  - `c_offset`: The zero-based index of the first change records to include in the result.
  - `c_type`: The type of change to include in the result (ie `product`, `priceBook`, or `price`). Omit to include all types.
  - `c_since`: Return all changes since the specified ISO 8601 datetime.
- **Request Body**: JSON object containing an array of product IDs (max 100)
- **Authentication**: AmOAuth2 with `c_aco` scope
- **Response**: Returns detailed product information including prices per price book, attributes, images, and metadata.

## Usage Examples

### Get Site Catalog

```sh
curl -X GET "https://{short-code}.api.commercecloud.salesforce.com/custom/aco/v1/organizations/{org-id}/catalog?siteId={site-id}" \
  -H "Authorization: Bearer {scapi-access-token}" \
  -H "Content-Type: application/json"
```

### Get All Price Books

```sh
curl -X GET "https://{short-code}.api.commercecloud.salesforce.com/custom/aco/v1/organizations/{org-id}/pricebooks?siteId={site-id}&limit=100&offset=0" \
  -H "Authorization: Bearer {scapi-access-token}" \
  -H "Content-Type: application/json"
```

### Get Price Book By ID

```sh
curl -X GET "https://{short-code}.api.commercecloud.salesforce.com/custom/aco/v1/organizations/{org-id}/pricebooks/{priceBookId}?siteId={site-id}" \
  -H "Authorization: Bearer {scapi-access-token}" \
  -H "Content-Type: application/json"
```

### Get Products

```sh
curl -X POST "https://{short-code}.api.commercecloud.salesforce.com/custom/aco/v1/organizations/{org-id}/products?siteId={site-id}&locale={locale}" \
  -H "Authorization: Bearer {scapi-access-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "ids": ["product-id-1", "product-id-2"]
  }'
```

### Get ACO Tracked Changes

```sh
curl -X POST "https://{short-code}.api.commercecloud.salesforce.com/custom/aco/v1/organizations/{org-id}/changes?siteId={site-id}&limit=100&offset=0" \
  -H "Authorization: Bearer {scapi-access-token}" \
  -H "Content-Type: application/json"
```

## Project Structure

```
int_adobe_commerce_optimizer/
├── cartridge/
│   ├── package.json
│   ├── rest-apis/
│   │   ├── aco/
│   │   │   ├── api.json                        # API endpoint definition
│   │   │   ├── schema.yaml                     # OpenAPI schema
│   │   │   └── catalog.js                      # Site Catalog API Implementation logic
│   │   │   └── changes.js                      # ACO Tracked Changes API Implementation logic
│   │   │   ├── pricebooks.js                   # Price Book API Implementation logic
│   │   │   ├── products.js                     # Products API Implementation logic
│   │   │   └── changes.js                      # ACO Tracked Changes API Implementation logic
│   └── scripts/
│       ├── jobs/
│       │   └── acoTrackedChanges.js            # ACO Tracked Changes job step implmentation
│       ├── .project                            # Cartidge project definition file
│       └── steptypes.json                      # Job step definitions
├── metadata/
│   ├── meta/
│   │   ├── custom-objecttype-definitions.xml   # AcoTrackedChanges custom object type definition
│   └── jobs.xml
├── README.md
└── dw.json.dist                                # Cartridge upload configuration template
```
