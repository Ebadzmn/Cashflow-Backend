# Google Play Subscriptions

The subscription API supports Google Play Store In-App Subscriptions alongside Apple StoreKit 2 subscriptions. It uses Google's official `googleapis` (`androidpublisher v3`) and Real-Time Developer Notifications (RTDN) via Google Cloud Pub/Sub.

## Configuration

Set the required `GOOGLE_*` variables through the deployment environment:

```env
GOOGLE_SUBSCRIPTIONS_ENABLED=true
GOOGLE_PACKAGE_NAME=com.yourapp.cashflow
# Provide either key file path or full JSON string:
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=certs/google/service-account.json
# GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
GOOGLE_PRODUCT_MAP={"com.cashflow.pro.monthly":{"plan":"Pro-Professional","billingCycle":"monthly"},"com.cashflow.pro.yearly":{"plan":"Pro-Professional","billingCycle":"yearly"}}
```

Never commit service account private keys or production credentials to git.

## Setup Instructions

### 1. Google Cloud Console

1. Go to Google Cloud Console and select/create your project.
2. Enable the **Google Play Android Developer API**.
3. Create a **Service Account** and generate a JSON key file.
4. Save the key file securely (e.g. `certs/google/service-account.json`).

### 2. Google Play Console Linking

1. In Google Play Console, navigate to **Setup** > **API access**.
2. Link the Google Cloud project and invite the Service Account email.
3. Grant **Permissions**:
   - _View financial data, orders, and cancellation survey responses_
   - _Manage orders and subscriptions_

### 3. Real-Time Developer Notifications (RTDN)

Google Play delivers events via Google Cloud Pub/Sub:

1. In Google Cloud Pub/Sub, create a Topic (e.g., `projects/YOUR_PROJECT_ID/topics/play-subs`).
2. Add publisher permission for `google-play-developer-notifications@system.gserviceaccount.com`.
3. In Google Play Console > **Monetization setup** > **Real-time developer notifications**, configure the Topic name.
4. In Cloud Pub/Sub, create a **Push Subscription** with endpoint URL:
   ```text
   https://YOUR_API_HOST/api/v1/google/webhook
   ```

## Endpoints

### 1. Verify Purchase (Android Client)

- **URL**: `POST /api/v1/subscription/google/verify` (or `/api/v1/subscriptions/google/verify`)
- **Headers**: `Authorization: Bearer <user_jwt_token>`
- **Body**:
  ```json
  {
    "purchaseToken": "in-app-purchase-token-from-google-play",
    "productId": "com.cashflow.pro.monthly"
  }
  ```

### 2. Webhook (Pub/Sub Push)

- **URL**: `POST /api/v1/google/webhook`
- **Body**: Standard Pub/Sub push message format:
  ```json
  {
    "message": {
      "data": "<base64_encoded_developer_notification>",
      "messageId": "..."
    }
  }
  ```

### 3. Subscription Status

- **URL**: `GET /api/v1/subscription/status`
- Automatically returns status for both iOS and Android subscribers without client differentiation.
