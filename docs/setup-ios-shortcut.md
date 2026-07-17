# iOS Apple Health Push Shortcut Setup

To sync your sleep, heart rate, weight, and fitness metrics from Apple Health (loaded from your Mi Fitness app) to Life-OS, you can configure a native iOS Shortcut on your iPhone. 

This shortcut extracts metrics from Apple Health, formats them into a JSON payload, and posts them to your FastAPI backend.

---

## Part 1: How the Shortcut is Structured

You can build this manually in the **Shortcuts** app on your iPhone:

1. **Find Sleep Sessions**:
   - Add a **Find Health Samples** action.
   - Set type to **Sleep Analysis**.
   - Filter: `Start Date is in the last 1 day`.
   - Sort by: `Start Date` (Oldest to Newest).
   - Get the total duration of these samples (convert to minutes).

2. **Find HRV Samples**:
   - Add a **Find Health Samples** action.
   - Set type to **Heart Rate Variability**.
   - Filter: `Start Date is in the last 1 day`.
   - Add a **Get Average of Health Samples** action.

3. **Find Resting Heart Rate**:
   - Add a **Find Health Samples** action.
   - Set type to **Resting Heart Rate**.
   - Filter: `Start Date is in the last 1 day`.
   - Add a **Get Average of Health Samples** action (or Get Latest).

4. **Find Weight**:
   - Add a **Find Health Samples** action.
   - Set type to **Weight**.
   - Filter: `Start Date is in the last 1 day`.
   - Add a **Get Latest of Health Samples** action.

5. **Find Steps**:
   - Add a **Find Health Samples** action.
   - Set type to **Steps**.
   - Filter: `Start Date is in the last 1 day`.
   - Add a **Get Sum of Health Samples** action.

6. **Find Active Calories**:
   - Add a **Find Health Samples** action.
   - Set type to **Active Energy**.
   - Filter: `Start Date is in the last 1 day`.
   - Add a **Get Sum of Health Samples** action.

7. **Find VO2 Max**:
   - Add a **Find Health Samples** action.
   - Set type to **VO2 Max**.
   - Filter: `Start Date is in the last 1 day`.
   - Add a **Get Latest of Health Samples** action.

8. **Create JSON Dictionary**:
   - Add a **Dictionary** action with the following key-value pairs (use the health sample outputs from above):
     - `date` (Text): `Current Date` formatted as `yyyy-MM-dd`
     - `sleep_duration_minutes` (Number): *[Output of Sleep Duration]*
     - `resting_heart_rate` (Number): *[Output of Resting Heart Rate]*
     - `hrv` (Number): *[Output of HRV]*
     - `steps` (Number): *[Output of Steps]*
     - `active_calories` (Number): *[Output of Active Calories]*
     - `body_weight_kg` (Number): *[Output of Weight]*
     - `vo2_max` (Number): *[Output of VO2 Max]*

9. **Send POST Request**:
   - Add a **Get Contents of URL** action.
   - Set URL to: `https://<YOUR-NGROK-DOMAIN>.ngrok-free.app/api/health-metrics`
   - Set Method to: `POST`
   - Set Headers: 
     - `Content-Type`: `application/json`
   - Set Request Body to: `File` and choose the **Dictionary** from step 8.

---

## Part 2: Automating It

To run this automatically every morning:
1. Open the **Shortcuts** app on your iPhone.
2. Tap the **Automation** tab at the bottom.
3. Tap the **+** button in the top right to create a new automation.
4. Select **Time of Day** (e.g., set it to `8:00 AM` daily).
5. Toggle **Run Immediately** (so it doesn't prompt you for approval).
6. Under actions, select your newly created Health Sync Shortcut.
7. Tap **Done**. 

Every morning at 8:00 AM, your iPhone will fetch your sleep, weight, and fitness data and securely upload it to your Life-OS server!
