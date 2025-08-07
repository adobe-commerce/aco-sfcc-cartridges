# ACO SFCC Starter Kit Cartridges

An Adobe Commerce Optimizer (ACO) integration cartridge for Salesforce Commerce Cloud (SFCC) that provides custom SCAPI endpoints for accessing price books and product data.

This custom SFCC Cartridge is required to enable functionality in the [ACO SFCC Starter Kit](https://github.com/adobe-commerce/aco-sfcc-starter-kit).

## Overview

This cartridge (`int_adobe_commerce_optimizer`) creates custom REST API endpoints using the Salesforce Commerce API (SCAPI) framework:

1. **Site Catalog API** - Retrieve information about the catalog assigned to the given site.
2. **Price Books API** - Retrieve price book information (including hierarchy) for a site.
3. **Products API** - Retrieve detailed product and price (per price book) information by product IDs.
4. **ACO Tracked Changes API** - Retrieve information about product, price book, and price information that has recently been changed in SFCC.

## Documentation & Resources

### Adobe Commerce Optimizer SFCC Starter Kit

- [ACO Developer Documentation](https://developer.adobe.com/commerce/services/)
- [ACO SFCC Starter Kit Repo](https://github.com/adobe-commerce/aco-sfcc-starter-kit)

### Salesforce Developer Documentation

- [Cartridge Development Guide](https://developer.salesforce.com/docs/commerce/b2c-commerce/guide/b2c-cartridges.html)
- [SCAPI Custom Endpoints](https://developer.salesforce.com/docs/commerce/commerce-api/guide/custom-apis.html)
- [Prophet Debugger Extension](https://marketplace.visualstudio.com/items?itemName=SqrTT.prophet)

## Installation

### Prerequisites

- Visual Studio Code
- Valid SFCC sandbox instance
- SFCC Account Manager access

**NOTE:** SFCC registers new custom SCAPI endpoints during the code activation process. It is recommended to create a new code version, upload the `int_adobe_commerce_optimizer` cartridge to the new code version and then `Activate` it.

### Using Prophet VSCode Extension

1. **Install Prophet Debugger Extension**

   - Open VS Code
   - Go to Extensions (Ctrl+Shift+X)
   - Search for the [Prophet Debugger](https://marketplace.visualstudio.com/items?itemName=SqrTT.prophet) extension.
   - Install the extension

2. **Create a new code version**

   - Log into Business Manager
   - Navigate to Administration > Sites > Manage Sites
   - Create a new code version (ie. `version2`)

3. **Configure Cartridge Upload**

   - Copy `dw.json.dist` to `dw.json`
   - Update the configuration with your sandbox details:
     ```json
     {
       "hostname": "{short-code}.dx.commercecloud.salesforce.com",
       "username": "your-username",
       "password": "your-password",
       "version": "version2",
       "cartridge": ["int_adobe_commerce_optimizer"],
       "cartridgesPath": "int_adobe_commerce_optimizer"
     }
     ```

4. **Upload Cartridge**

   - Open VS Code in the project root directory
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Prophet" and select "Prophet: Clean Project/Upload all"
   - The extension will upload the cartridge to your sandbox

5. **Configure Cartridge Path**

   - Log into Business Manager
   - Navigate to Administration > Sites > Manage Sites
   - Select your site
   - Go to Settings tab
   - Add `int_adobe_commerce_optimizer` to the cartridge path
   - Save the configuration

### Manual Installation

If you prefer manual installation without Prophet:

1. **Create Archive**

   ```bash
   cd int_adobe_commerce_optimizer
   zip -r int_adobe_commerce_optimizer.zip cartridge/
   ```

2. **Upload via WebDAV**

[Using SFCC WebDAV](https://sfcclearning.com/infocenter/content/b2c_commerce/topics/import_export/b2c_using_web_dav.php)

- Go to Administration > Site Development > Code Deployment
- Create a new code version (ie. `version2`)
- Select the new code version
- Find the WebDAV URL
- Upload the `int_adobe_commerce_optimizer.zip` file via a WebDAV client
- Activate the new code version

## Configuration

### OAuth2 Setup

The API endpoints require OAuth2 authentication with the `c_aco` scope:

1. **Create OAuth Client**

   - In Account Manager, create an API client
   - Add the `c_aco` scope to the client permissions
   - Note the client ID and secret

2. **Configure Permissions**
   - Ensure the client has access to the SCAPI endpoints
   - Grant necessary permissions for price book and product data access

### Enable the Cartridge

1. In Business Manager, naviate to **Administration -> Sites -> Manage Sites**.
2. Click the Site that will be synchronized with Adobe Commerce Optimizer.
3. Click the **Settings** tab.
4. Add `int_adobe_commerce_optimizer` to the list of enabled **Cartridges**.

### Configure the AdobeCommerceOptimizerTrackedChanges Job

**Important Note:** [Delta Exports](https://help.salesforce.com/s/articleView?language=en_US&id=cc.b2c_delta_exports.htm&type=5) functionality is required to be enabled in order for ACO to pick up changes made to SFCC entities. You may need to contact Salesforce support to enabled **Delta Exports** on your instance if it is not already.

1. Check the **Delta Exports** configuration
   1. Naviate to **Administration -> Site Development -> Delta Exports**
      1. Click the **New** button.
      2. Name the export `aco_delta_exports`.
      3. Click **Create** to continue.
      4. In the **Consumers** box, enter `aco`.
      5. Select `aco_delta_exports`
      6. Ensure both `Catalogs` and `Price Books` are selected for delta exports.
      7. If the box `Export Full Base Products` is checked, you may uncheck it.
      8. Click **Apply** to save this tab.
      9. Click the **Schedule** tab.
      10. Ensure the schedule is **Enabled** and set to run at a normal cadence such as every day or every hour. Align this with the AdobeCommerceOptimizerTrackedChanges job and ACO SFCC Starter Kit App Builder delta-sync action cron schedules.
      11. Click **Apply** to save the export configuration.

![Delta Exports Configuration](/docs/images/delta_exports_config.png)

![Delta Exports Schedule](/docs/images/delta_exports_schedule.png)

2. Import the `jobs.xml` file in Business Manager found in the `metadata` directory.
   1. Naviate to **Administration -> Operations -> Import & Export** and click **Upload** under the **Import & Export Files** section.
   2. Validate and upload the `jobs.xml` file.
   3. Click **Import** under the **Jobs** section.
   4. Import the uploaded jobs file.
3. Configure the **AdobeCommerceOptimizerTrackedChanges** job
   1. Naviate to **Administration -> Operations -> Jobs** and select the **AdobeCommerceOptimizerTrackedChanges** job.
   2. Click the **Job Steps** tab.
   3. Click **Job Parameters**.
   4. Confirm the `consumer` and `deltaExportJobName` match the details defined in the **Delta Exports** configured above.
   5. Click the **Scope** badge.
   6. Select the desired Sites to define the job execution scope.

![ACO Job Parameters](/docs/images/aco_job_params.png)

4.  Click the **Schedule and History** tab
5.  Ensure the schedule is **Enabled** and set to run at a normal cadence such as every day or every hour. Align this with your Delta Exports and ACO SFCC Starter Kit App Builder delta-sync action cron schedules.

![ACO Job Schedule](/docs/images/aco_job_schedule.png)

## Cartridge Implementation Details

See the [README.md](./int_adobe_commerce_optimizer/README.md) in the `int_adobe_commerce_optimizer` directory.
