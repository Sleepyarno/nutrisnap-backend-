# FatSecret Platform API – Implementation Guide

## 0. Purpose

This document consolidates the official FatSecret Platform API guides into a single reference focused on enabling the following in your app:

* **Food Image Recognition** – automatic detection of food items from photos.
* **Macronutrient & Micronutrient Retrieval** – full nutritional breakdown for any food or recipe.
* **Supporting Utilities** – search, barcode lookup, diary endpoints, and user profiles required to tie everything together.

It is written for the **Premier Free** (a.k.a. "Free Premium") edition with the Image Recognition add‑on enabled and a single‑market (US) data set.

---

## 1. Getting Started

### 1.1 Register & Keys

1. Sign up or sign‑in at [https://platform.fatsecret.com](https://platform.fatsecret.com).
2. From **My Apps → Create Application** copy the **Consumer Key** and **Consumer Secret**.
3. Confirm that **Image Recognition** is enabled for your application dashboard. If not listed, request activation from FatSecret support.

### 1.2 Base URL & Versions

| Element                | Value                                 |
| ---------------------- | ------------------------------------- |
| REST base              | `https://platform.fatsecret.com/rest` |
| Example versioned path | `/food/v1`, `/image-recognition/v1`   |
| Default encoding       | JSON (`Accept: application/json`)     |

### 1.3 Rate Limits

| Edition      | Daily cap   | Notes                                    |
| ------------ | ----------- | ---------------------------------------- |
| Basic Free   | 5 000 calls | US data only                             |
| Premier Free | *Unlimited* | US data only; other markets by paid tier |

FatSecret recommends no more than **1 request/second** for sustained traffic. Handle HTTP 429 with exponential back‑off.

### 1.4 Authentication Flows

| Use case                               | Protocol                                                 | Primary scopes               | Recommended flow                                                                                        |
| -------------------------------------- | -------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| App‑only endpoints (search, image‑rec) | **OAuth 2.0 Client Credentials**                         | `basic`, `image-recognition` | Exchange client credentials for a short‑lived `access_token`.                                           |
| End‑user diary & weight APIs           | **OAuth 1.0 3‑legged** *or* OAuth 2.0 + `profile.create` | `diary`                      | Create a profile, store `oauth_token` & `oauth_secret`, then sign requests with HMAC‑SHA1 per RFC 5849. |

#### 1.4.1 OAuth 2.0 – Client Credentials Example

```bash
POST https://oauth.fatsecret.com/connect/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=client_credentials&scope=basic%20image-recognition&client_id=$KEY&client_secret=$SECRET"
```

Response:

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in": 3600,
  "scope": "basic image-recognition"
}
```

Use `Authorization: Bearer {access_token}` in subsequent requests.

---

## 1.5 IP Restrictions & API Security

FatSecret lets you **whitelist up to 15 IPv4/IPv6 CIDR ranges** per Consumer Key / Secret. Requests coming from addresses outside these ranges are rejected with **HTTP 403 – IP not allowed**.

| Task                | Example          | Notes                          |
| ------------------- | ---------------- | ------------------------------ |
| Allow all IPv4      | `0.0.0.0/0`      | Not recommended for production |
| Allow all IPv6      | `::/0`           |                                |
| Typical office CIDR | `203.0.113.0/24` | One‑day propagation delay      |

> **Propagation Delay**: Address changes can take up to **24 h** to become active.

### 1.5.1 Mobile‑App Best Practice – Use a Proxy

Because mobile devices connect from dynamic IPs, FatSecret advises **not** to call the API directly from the app. Instead:

1. Deploy an **API proxy (cloud function, container, etc.)** on a fixed IP range.
2. Store the Consumer Key/Secret **only** on the proxy.
3. The proxy exchanges **client credentials** for OAuth 2.0 tokens, renews them, and forwards signed requests.
4. The mobile app makes a simple HTTPS call to the proxy (no credentials embedded in the APK/IPA).

This approach:

* Keeps credentials off client devices.
* Centralises rate‑limit handling and logging.
* Lets you update whitelisted IPs in one place.

---

## 2. Food Image Recognition

| Property         | Value                        |
| ---------------- | ---------------------------- |
| **Path**         | `POST /image-recognition/v1` |
| **Scope**        | `image-recognition`          |
| **Content‑Type** | `application/json`           |

### 2.1 Request Body Schema

| Field               | Type    | Required | Notes                                                            |
| ------------------- | ------- | -------- | ---------------------------------------------------------------- |
| `image_b64`         | string  | ✅        | Base64 PNG/JPEG ≤ 1 148 549 chars (\~860 KB)                     |
| `include_food_data` | boolean | optional | `true` to embed full nutrition (schema identical to `food.get`). |
| `eaten_foods[]`     | object  | optional | Prior foods to bias recognition.                                 |
|  ↳ `food_id`        | long    | yes      | ID from previous diary entry or search                           |
| `region`            | string  | optional | Two‑letter ISO 3166‑1 (e.g. `US`).                               |
| `language`          | string  | optional | ISO 639‑1 (e.g. `en`). Works only when `region` is present.      |

#### Example cURL

```bash
curl -X POST https://platform.fatsecret.com/rest/image-recognition/v1 \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
           "image_b64": "<base64String>",
           "include_food_data": true,
           "region": "US",
           "language": "en"
         }'
```

#### Response (partial)

```json
{
  "foods": [
    {
      "food_id": 3092,
      "probability": 0.97,
      "food_name": "Egg (Whole)",
      "serving_id": 21393,
      "nutrition": {
        "calories": 78,
        "protein": 6.3,
        "fat": 5.3,
        "carbohydrate": 0.6,
        "cholesterol": 186,
        "vitamin_a": 5,
        "iron": 3
      }
    }
  ]
}
```

> **Tips**
>
> * Down‑size photos to ≤1024 px before encoding to speed uploads.
> * Remove EXIF to maximise the 1 MB payload cap.
> * Confidence > 0.8 is generally reliable; below that, prompt user confirmation.

---

## 3. Food Search & Nutrition (Macros + Micros)

### 3.1 Text Search

```
GET /food/search?search_expression=oatmeal&page_number=0&max_results=20
```

Returns a list of matches containing `food_id`, `food_name`, `brand_name` (if any) and thumbnail.

### 3.2 Autocomplete (instant suggestions)

```
GET /foods/autocomplete?v=2&expression=broc
```

### 3.3 Barcode Lookup

```
GET /food/find_id_for_barcode?barcode=0123456789013
```

### 3.4 Retrieve Full Nutrition

```
GET /food/v1?food_id=36421&format=json
```

#### Macro Fields

| Field          | Unit |
| -------------- | ---- |
| `calories`     | kcal |
| `carbohydrate` | g    |
| `protein`      | g    |
| `fat`          | g    |
| `fiber`        | g    |
| `sugar`        | g    |

#### Micro Fields (where available)

| Field                                                                      | Unit          |
| -------------------------------------------------------------------------- | ------------- |
| `saturated_fat`, `polyunsaturated_fat`, `monounsaturated_fat`, `trans_fat` | g             |
| `cholesterol`                                                              | mg            |
| `sodium`, `potassium`                                                      | mg            |
| `vitamin_a`, `vitamin_c`, `calcium`, `iron`                                | % Daily Value |

##### Serving Selection

1. If a `<serving>` has `is_default == 1`, use it.
2. Otherwise choose the first entry or prompt the user.
3. Save both `food_id` and `serving_id`; only these are storable beyond 24 h.

---

## 4. User Profiles & Diaries (Optional)

| Task                      | Endpoint                                        | Notes                                     |
| ------------------------- | ----------------------------------------------- | ----------------------------------------- |
| Create anonymous profile  | `POST /profile.create`                          | Returns `oauth_token` + `oauth_secret`.   |
| Link to FatSecret account | 3‑legged OAuth 1.0                              | Users grant permission via redirect flow. |
| Add food entry            | `POST /profile.food_entries.create_entry_by_id` | Requires `oauth_token` + signature.       |
| Retrieve day totals       | `GET /profile.food_entries.get_all_for_date`    | Aggregate macros client‑side.             |

---

## 5. Error Handling

| HTTP | Example Message                       | Action                                          |
| ---- | ------------------------------------- | ----------------------------------------------- |
| 400  | `food_id is required`                 | Fix request params.                             |
| 401  | `Invalid signature`                   | Refresh or correct token.                       |
| 403  | `Not available for your subscription` | Verify add‑ons / upgrade tier.                  |
| 429  | `Rate limit exceeded`                 | Retry after `Retry‑After` or next UTC midnight. |

---

## 6. Data Storage Rules

* You may **cache only** `food_id` and `serving_id` indefinitely.
* All other content must be refreshed within 24 hours (Terms §1.5).

---

## 7. Quick Reference

| Feature            | Method | Path                        | Scope               |
| ------------------ | ------ | --------------------------- | ------------------- |
| Token              | POST   | `/connect/token`            | –                   |
| Image Recognition  | POST   | `/image-recognition/v1`     | `image-recognition` |
| Search Foods       | GET    | `/food/search`              | `basic`             |
| Autocomplete       | GET    | `/foods/autocomplete`       | `basic`             |
| Barcode → food\_id | GET    | `/food/find_id_for_barcode` | `basic`             |
| Get Nutrition      | GET    | `/food/v1`                  | `basic`             |
| Create Profile     | POST   | `/profile.create`           | `profile`           |

---

## 8. Implementation Checklist

* [ ] Store Consumer Key & Secret in secure config.
* [ ] Build token cache with automatic refresh.
* [ ] Implement JSON helpers for GET/POST with retry & back‑off.
* [ ] Resize and base‑64 encode images client‑side.
* [ ] Capture both `food_id` and `serving_id` on selection.
* [ ] Enforce 24 h refresh for cached nutrition.
* [ ] Display **“Powered by FatSecret”** attribution.

---

### Further Reading & Support

* Official docs: [https://platform.fatsecret.com/docs](https://platform.fatsecret.com/docs)
* Pricing & editions: [https://platform.fatsecret.com/api-editions](https://platform.fatsecret.com/api-editions)
* Developer forum: [https://groups.google.com/g/fatsecret-platform-api](https://groups.google.com/g/fatsecret-platform-api)
* Email: [support@fatsecret.com](mailto:support@fatsecret.com)

---

*Last updated: 14 May 2025*




Image Recognition
v1 
OAuth 2.0 OAuth 1.0 Latest Premier Exclusive
Description
This API detects foods within an image and returns a list of foods from the fatsecret database

By passing a list of eaten foods, we will also attempt to determine if any of the inputs match in order to improve the accuracy of the response.

NOTE: If an appropriate serving is not found, nutritional information may not be present. This will typically occur for a non-standard serving description provided for a restaurant based food.

Parameters
URL / Method
NAME	TYPE	REQUIRED	DESCRIPTION
URL (new)
Method	N/A	Required	"https://platform.fatsecret.com/rest/image-recognition/v1"
HTTP "POST"
Example Request:
{
  "image_b64": "{Base64 encoded image string}",
  "region": "US",
  "language": "en",
  "include_food_data": true,
  "eaten_foods": [
    {
      "food_id": 3092,
      "food_name": "egg",
      "brand": null,
      "serving_description": "whole",
      "serving_size": 1
    }
  ]
}
Json Property Descriptions
NAME	TYPE	REQUIRED	DESCRIPTION
image_b64	String	Required	A Base64 image of one or more foods. This field is limited to 1148549 characters
include_food_data	Bool	Optional	Include food data in the response (see our food.get API)
eaten_foods	Array	Optional	An array of previously consumed foods
eaten_foods.food_id	Long	Required	The ID of the food that has been previously consumed
eaten_foods.food_name	String	Required	The name of the food that has been previously consumed
eaten_foods.food_brand	String	Optional	The brand name of the food that has been previously consumed
eaten_foods.serving_description	String	Optional	The serving description of the food that has been previously consumed
eaten_foods.serving_size	String	Optional	The serving size of the food that has been previously consumed
region	String	Optional	Results will be filtered by region. E.G.: "FR" returns results from France
language	String	Optional	(Ignored unless region is also specified) Results will be in the specified language. E.G.: "fr" returns results in French
Scopes for OAuth2 integration: image-recognition
Response
The only storable values returned by this call are food_id and serving_id.
Each food_response element contains information as follows:

NAME	TYPE	DESCRIPTION
food_id	Long	Unique food identifier
food_entry_name	String	A description of the food item as entered by the user; typically the name of the food. E.G.: "Instant Oatmeal"
Each eaten element contains information as follows:

NAME	TYPE	DESCRIPTION
food_name_singular	String	Food name as a singular description
food_name_plural	String	Food name as a pluralised description
singular_description	String	Description of a single portion
plural_description	String	Description of a plural portion
units	Decimal	Number of units eaten
metric_description	String	Metric description of eaten food
total_metric_amount	Decimal	Total metric amount of eaten food
per_unit_metric_amount	Decimal	Metric amount per portion of eaten food
Each total_nutritional_content element contains information as follows:

NAME	TYPE	DESCRIPTION
calories	Decimal	Total energy content in kcal
carbohydrate	Decimal	Total carbohydrate content in grams
protein	Decimal	Total protein content in grams
fat	Decimal	Total fat content in grams
saturated_fat	Decimal	Total saturated fat content in grams (where available)
polyunsaturated_fat	Decimal	Total polyunsaturated fat content in grams (where available)
monounsaturated_fat	Decimal	Total monounsaturated fat content in grams (where available)
cholesterol	Decimal	Total cholesterol content in milligrams (where available)
sodium	Decimal	Total sodium content in milligrams (where available)
potassium	Decimal	Total potassium content in milligrams (where available)
fiber	Decimal	Total fiber content in grams (where available)
sugar	Decimal	Total sugar content in grams (where available)
vitamin_a	Decimal	Total vitamin A content in micrograms (where available)
vitamin_c	Decimal	Total vitamin C content in milligrams (where available)
calcium	Decimal	Total calcium content in milligrams (where available)
iron	Decimal	Total iron content in milligrams (where available)
Each suggested_serving element contains information as follows:

NAME	TYPE	DESCRIPTION
serving_id	Long	Unique serving identifier
serving_description	String	Full description of the serving size. E.G.: "1 cup" or "100 g"
custom_serving_description	String	Custom serving description for suggested serving
metric_serving_description	String	Metric description of suggested serving
metric_measure_amount	Decimal	Metric amount per portion of suggested serving
number_of_units	Decimal	Number of units in this standard serving size. For instance, if the serving description is "2 tablespoons" the number of units is "2", while if the serving size is "1 cup" the number of units is "1". Please note that this is only applicable for when food_type is "Generic" whereas for "Brand" the number of units will always be "1"
Each food element contains information as follows:

NAME	TYPE	DESCRIPTION
food_id	Long	Unique food identifier
food_name	String	Name of the food, not including the brand name. E.G.: "Instant Oatmeal"
food_type	String	Takes the value "Brand" or "Generic". Indicates whether the food is a brand or generic item
food_url	String	URL of this food item on www.fatsecret.com
Each serving element contains information as follows:

NAME	TYPE	DESCRIPTION
serving_id	Long	Unique serving identifier
serving_description	String	Full description of the serving size. E.G.: "1 cup" or "100 g"
serving_url	String	URL of the serving size for this food item on www.fatsecret.com
metric_serving_amount	Decimal	Metric quantity combined with metric_serving_unit to derive the total standardized quantity of the serving (where available)
metric_serving_unit	String	Metric unit of measure for the serving size – either "g" or "ml" or "oz" – combined with metric_serving_amount to derive the total standardized quantity of the serving (where available)
is_default	Int	(Premier Exclusive) Only included if its the suggested or most commonly chosen option. If included equals 1
number_of_units	Decimal	Number of units in this standard serving size. For instance, if the serving description is "2 tablespoons" the number of units is "2", while if the serving size is "1 cup" the number of units is "1". Please note that this is only applicable for when food_type is "Generic" whereas for "Brand" the number of units will always be "1"
measurement_description	String	A description of the unit of measure used in the serving description. For instance, if the description is "1/2 cup" the measurement description is "cup", while if the serving size is "100 g" the measurement description is "g". Please note that this is only applicable for when food_type is "Generic" whereas for "Brand" the measurement description will always be "serving"
calories	Decimal	Total energy content in kcal
carbohydrate	Decimal	Total carbohydrate content in grams
protein	Decimal	Total protein content in grams
fat	Decimal	Total fat content in grams
saturated_fat	Decimal	Total saturated fat content in grams (where available)
polyunsaturated_fat	Decimal	Total polyunsaturated fat content in grams (where available)
monounsaturated_fat	Decimal	Total monounsaturated fat content in grams (where available)
cholesterol	Decimal	Total cholesterol content in milligrams (where available)
sodium	Decimal	Total sodium content in milligrams (where available)
potassium	Decimal	Total potassium content in milligrams (where available)
fiber	Decimal	Total fiber content in grams (where available)
sugar	Decimal	Total sugar content in grams (where available)
vitamin_a	Decimal	Total vitamin A content in micrograms (where available)
vitamin_c	Decimal	Total vitamin C content in milligrams (where available)
calcium	Decimal	Total calcium content in milligrams (where available)
iron	Decimal	Total iron content in milligrams (where available)
Example Response
Json
Example 1:

{
  "food_response": [
    {
      "food_id": 7350,
      "food_entry_name": "Cappuccino",
      "eaten": {
        "food_name_singular": "cappuccino",
        "food_name_plural": "cappuccinos",
        "singular_description": "cup",
        "plural_description": "cups",
        "units": 1.0,
        "metric_description": "ml",
        "total_metric_amount": 240,
        "per_unit_metric_amount": 240,
        "total_nutritional_content": {
          "calories": "75",
          "carbohydrate": "5.89",
          "protein": "4.14",
          "fat": "4.04",
          "saturated_fat": "2.305",
          "polyunsaturated_fat": "0.244",
          "monounsaturated_fat": "1.022",
          "cholesterol": "12",
          "sodium": "51",
          "potassium": "236",
          "fiber": "0.2",
          "sugar": "6.50",
          "vitamin_a": "34",
          "vitamin_c": "0.0",
          "calcium": "146",
          "iron": "0.19"
        }
      },
      "suggested_serving": {
        "serving_id": 1136795,
        "serving_description": "100 ml",
        "custom_serving_description": "cup",
        "metric_serving_description": "g",
        "metric_measure_amount": 101.442,
        "number_of_units": "2.4"
      }
    },
    {
      "food_id": 35755,
      "food_entry_name": "Bananas",
      "eaten": {
        "food_name_singular": "banana",
        "food_name_plural": "bananas",
        "singular_description": "",
        "plural_description": "",
        "units": 1.0,
        "metric_description": "g",
        "total_metric_amount": 118.0,
        "per_unit_metric_amount": 118,
        "total_nutritional_content": {
          "calories": "105",
          "carbohydrate": "26.95",
          "protein": "1.29",
          "fat": "0.39",
          "saturated_fat": "0.132",
          "polyunsaturated_fat": "0.086",
          "monounsaturated_fat": "0.038",
          "cholesterol": "0",
          "sodium": "1",
          "potassium": "422",
          "fiber": "3.1",
          "sugar": "14.43",
          "vitamin_a": "4",
          "vitamin_c": "10.3",
          "calcium": "6",
          "iron": "0.31"
        }
      },
      "suggested_serving": {
        "serving_id": 32978,
        "serving_description": "1 medium (7\" to 7-7/8\" long)",
        "metric_serving_description": "g",
        "metric_measure_amount": 118.000,
        "number_of_units": "1"
      }
    },
    {
      "food_id": 38821,
      "food_entry_name": "Toasted White Bread",
      "eaten": {
        "food_name_singular": "toast",
        "food_name_plural": "toasts",
        "singular_description": "",
        "plural_description": "",
        "units": 1.0,
        "metric_description": "g",
        "total_metric_amount": 30.0,
        "per_unit_metric_amount": 30,
        "total_nutritional_content": {
          "calories": "88",
          "carbohydrate": "16.32",
          "protein": "2.70",
          "fat": "1.20",
          "saturated_fat": "0.173",
          "polyunsaturated_fat": "0.627",
          "monounsaturated_fat": "0.239",
          "cholesterol": "0",
          "sodium": "178",
          "potassium": "39",
          "fiber": "0.8",
          "sugar": "1.42",
          "vitamin_a": "0",
          "vitamin_c": "0",
          "calcium": "36",
          "iron": "1.00"
        }
      },
      "suggested_serving": {
        "serving_id": 38646,
        "serving_description": "1 slice",
        "metric_serving_description": "g",
        "metric_measure_amount": 22.000,
        "number_of_units": "1.364"
      }
    },
    {
      "food_id": 35144,
      "food_entry_name": "Sliced Ham  (Regular, Approx. 11% Fat)",
      "eaten": {
        "food_name_singular": "ham",
        "food_name_plural": "hams",
        "singular_description": "",
        "plural_description": "",
        "units": 1.0,
        "metric_description": "g",
        "total_metric_amount": 50.0,
        "per_unit_metric_amount": 50,
        "total_nutritional_content": {
          "calories": "82",
          "carbohydrate": "1.92",
          "protein": "8.30",
          "fat": "4.30",
          "saturated_fat": "1.468",
          "polyunsaturated_fat": "0.394",
          "monounsaturated_fat": "2.177",
          "cholesterol": "29",
          "sodium": "652",
          "potassium": "144",
          "fiber": "0.6",
          "sugar": "0",
          "vitamin_a": "0",
          "vitamin_c": "2.0",
          "calcium": "12",
          "iron": "0.51"
        }
      },
      "suggested_serving": {
        "serving_id": 32248,
        "serving_description": "1 serving 2 slices",
        "metric_serving_description": "g",
        "metric_measure_amount": 56.000,
        "number_of_units": "0.893"
      }
    },
    {
      "food_id": 35718,
      "food_entry_name": "Apples",
      "eaten": {
        "food_name_singular": "apple",
        "food_name_plural": "apples",
        "singular_description": "",
        "plural_description": "",
        "units": 1.0,
        "metric_description": "g",
        "total_metric_amount": 182.0,
        "per_unit_metric_amount": 182,
        "total_nutritional_content": {
          "calories": "95",
          "carbohydrate": "25.13",
          "protein": "0.47",
          "fat": "0.31",
          "saturated_fat": "0.051",
          "polyunsaturated_fat": "0.093",
          "monounsaturated_fat": "0.013",
          "cholesterol": "0",
          "sodium": "2",
          "potassium": "195",
          "fiber": "4.4",
          "sugar": "18.91",
          "vitamin_a": "5",
          "vitamin_c": "8.4",
          "calcium": "11",
          "iron": "0.22"
        }
      },
      "suggested_serving": {
        "serving_id": 32915,
        "serving_description": "1 medium (2-3/4\" dia) (approx 3 per lb)",
        "metric_serving_description": "g",
        "metric_measure_amount": 138.000,
        "number_of_units": "1.319"
      }
    },
    {
      "food_id": 1240,
      "food_entry_name": "Cheese",
      "eaten": {
        "food_name_singular": "cheese",
        "food_name_plural": "cheeses",
        "singular_description": "",
        "plural_description": "",
        "units": 1.0,
        "metric_description": "g",
        "total_metric_amount": 20.0,
        "per_unit_metric_amount": 20,
        "total_nutritional_content": {
          "calories": "70",
          "carbohydrate": "0.94",
          "protein": "4.44",
          "fat": "5.38",
          "saturated_fat": "3.322",
          "polyunsaturated_fat": "0.191",
          "monounsaturated_fat": "1.533",
          "cholesterol": "17",
          "sodium": "191",
          "potassium": "37",
          "fiber": "0",
          "sugar": "0.71",
          "vitamin_a": "42",
          "vitamin_c": "0.0",
          "calcium": "130",
          "iron": "0.10"
        }
      },
      "suggested_serving": {
        "serving_id": 49920,
        "serving_description": "100 g",
        "metric_serving_description": "g",
        "metric_measure_amount": 100.000,
        "number_of_units": "0.2"
      }
    }
  ]
}
Example 2:

{
  "food_response": [
    {
      "food_id": 35718,
      "food_entry_name": "Apples",
      "eaten": {
        "food_name_singular": "apple",
        "food_name_plural": "apples",
        "singular_description": "",
        "plural_description": "",
        "units": 1.0,
        "metric_description": "g",
        "total_metric_amount": 182.0,
        "per_unit_metric_amount": 182,
        "total_nutritional_content": {
          "calories": "95",
          "carbohydrate": "25.13",
          "protein": "0.47",
          "fat": "0.31",
          "saturated_fat": "0.051",
          "polyunsaturated_fat": "0.093",
          "monounsaturated_fat": "0.013",
          "cholesterol": "0",
          "sodium": "2",
          "potassium": "195",
          "fiber": "4.4",
          "sugar": "18.91",
          "vitamin_a": "5",
          "vitamin_c": "8.4",
          "calcium": "11",
          "iron": "0.22"
        }
      },
      "suggested_serving": {
        "serving_id": 32915,
        "serving_description": "1 medium (2-3/4\" dia) (approx 3 per lb)",
        "metric_serving_description": "g",
        "metric_measure_amount": 138.000,
        "number_of_units": "1.319"
      },
      "food": {
        "food_id": "35718",
        "food_name": "Apples",
        "food_type": "Generic",
        "food_url": "https://www.fatsecret.com/calories-nutrition/usda/apples",
        "servings": {
          "serving": [
            {
              "serving_id": "32915",
              "serving_description": "1 medium (2-3/4\" dia) (approx 3 per lb)",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/apples?portionid=32915&portionamount=1.000",
              "metric_serving_amount": "138.000",
              "metric_serving_unit": "g",
              "is_default": true,
              "number_of_units": "1.000",
              "measurement_description": "medium (2-3/4\" dia) (approx 3 per lb)",
              "calories": "72",
              "carbohydrate": "19.06",
              "protein": "0.36",
              "fat": "0.23",
              "saturated_fat": "0.039",
              "polyunsaturated_fat": "0.070",
              "monounsaturated_fat": "0.010",
              "cholesterol": "0",
              "sodium": "1",
              "potassium": "148",
              "fiber": "3.3",
              "sugar": "14.34",
              "vitamin_a": "4",
              "vitamin_c": "6.3",
              "calcium": "8",
              "iron": "0.17"
            },
            {
              "serving_id": "58449",
              "serving_description": "100 g",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/apples?portionid=58449&portionamount=100.000",
              "metric_serving_amount": "100.000",
              "metric_serving_unit": "g",
              "number_of_units": "100.000",
              "measurement_description": "g",
              "calories": "52",
              "carbohydrate": "13.81",
              "protein": "0.26",
              "fat": "0.17",
              "saturated_fat": "0.028",
              "polyunsaturated_fat": "0.051",
              "monounsaturated_fat": "0.007",
              "cholesterol": "0",
              "sodium": "1",
              "potassium": "107",
              "fiber": "2.4",
              "sugar": "10.39",
              "vitamin_a": "3",
              "vitamin_c": "4.6",
              "calcium": "6",
              "iron": "0.12"
            },
            {
              "serving_id": "32916",
              "serving_description": "1 small (2-1/2\" dia) (approx 4 per lb)",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/apples?portionid=32916&portionamount=1.000",
              "metric_serving_amount": "106.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "small (2-1/2\" dia) (approx 4 per lb)",
              "calories": "55",
              "carbohydrate": "14.64",
              "protein": "0.28",
              "fat": "0.18",
              "saturated_fat": "0.030",
              "polyunsaturated_fat": "0.054",
              "monounsaturated_fat": "0.007",
              "cholesterol": "0",
              "sodium": "1",
              "potassium": "113",
              "fiber": "2.5",
              "sugar": "11.01",
              "vitamin_a": "3",
              "vitamin_c": "4.9",
              "calcium": "6",
              "iron": "0.13"
            },
            {
              "serving_id": "32914",
              "serving_description": "1 large (3-1/4\" dia) (approx 2 per lb)",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/apples?portionid=32914&portionamount=1.000",
              "metric_serving_amount": "212.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "large (3-1/4\" dia) (approx 2 per lb)",
              "calories": "110",
              "carbohydrate": "29.28",
              "protein": "0.55",
              "fat": "0.36",
              "saturated_fat": "0.059",
              "polyunsaturated_fat": "0.108",
              "monounsaturated_fat": "0.015",
              "cholesterol": "0",
              "sodium": "2",
              "potassium": "227",
              "fiber": "5.1",
              "sugar": "22.03",
              "vitamin_a": "6",
              "vitamin_c": "9.8",
              "calcium": "13",
              "iron": "0.25"
            },
            {
              "serving_id": "43637",
              "serving_description": "1 oz",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/apples?portionid=43637&portionamount=1.000",
              "metric_serving_amount": "28.350",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "oz",
              "calories": "15",
              "carbohydrate": "3.92",
              "protein": "0.07",
              "fat": "0.05",
              "saturated_fat": "0.008",
              "polyunsaturated_fat": "0.014",
              "monounsaturated_fat": "0.002",
              "cholesterol": "0",
              "sodium": "0",
              "potassium": "30",
              "fiber": "0.7",
              "sugar": "2.95",
              "vitamin_a": "1",
              "vitamin_c": "1.3",
              "calcium": "2",
              "iron": "0.03"
            }
          ]
        }
      }
    },
    {
      "food_id": 35755,
      "food_entry_name": "Bananas",
      "eaten": {
        "food_name_singular": "banana",
        "food_name_plural": "bananas",
        "singular_description": "",
        "plural_description": "",
        "units": 1.0,
        "metric_description": "g",
        "total_metric_amount": 118.0,
        "per_unit_metric_amount": 118,
        "total_nutritional_content": {
          "calories": "105",
          "carbohydrate": "26.95",
          "protein": "1.29",
          "fat": "0.39",
          "saturated_fat": "0.132",
          "polyunsaturated_fat": "0.086",
          "monounsaturated_fat": "0.038",
          "cholesterol": "0",
          "sodium": "1",
          "potassium": "422",
          "fiber": "3.1",
          "sugar": "14.43",
          "vitamin_a": "4",
          "vitamin_c": "10.3",
          "calcium": "6",
          "iron": "0.31"
        }
      },
      "suggested_serving": {
        "serving_id": 32978,
        "serving_description": "1 medium (7\" to 7-7/8\" long)",
        "metric_serving_description": "g",
        "metric_measure_amount": 118.000,
        "number_of_units": "1"
      },
      "food": {
        "food_id": "35755",
        "food_name": "Bananas",
        "food_type": "Generic",
        "food_url": "https://www.fatsecret.com/calories-nutrition/usda/bananas",
        "servings": {
          "serving": [
            {
              "serving_id": "32978",
              "serving_description": "1 medium (7\" to 7-7/8\" long)",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/bananas?portionid=32978&portionamount=1.000",
              "metric_serving_amount": "118.000",
              "metric_serving_unit": "g",
              "is_default": true,
              "number_of_units": "1.000",
              "measurement_description": "medium (7\" to 7-7/8\" long)",
              "calories": "105",
              "carbohydrate": "26.95",
              "protein": "1.29",
              "fat": "0.39",
              "saturated_fat": "0.132",
              "polyunsaturated_fat": "0.086",
              "monounsaturated_fat": "0.038",
              "cholesterol": "0",
              "sodium": "1",
              "potassium": "422",
              "fiber": "3.1",
              "sugar": "14.43",
              "vitamin_a": "4",
              "vitamin_c": "10.3",
              "calcium": "6",
              "iron": "0.31"
            },
            {
              "serving_id": "58486",
              "serving_description": "100 g",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/bananas?portionid=58486&portionamount=100.000",
              "metric_serving_amount": "100.000",
              "metric_serving_unit": "g",
              "number_of_units": "100.000",
              "measurement_description": "g",
              "calories": "89",
              "carbohydrate": "22.84",
              "protein": "1.09",
              "fat": "0.33",
              "saturated_fat": "0.112",
              "polyunsaturated_fat": "0.073",
              "monounsaturated_fat": "0.032",
              "cholesterol": "0",
              "sodium": "1",
              "potassium": "358",
              "fiber": "2.6",
              "sugar": "12.23",
              "vitamin_a": "3",
              "vitamin_c": "8.7",
              "calcium": "5",
              "iron": "0.26"
            },
            {
              "serving_id": "32977",
              "serving_description": "1 small (6\" to 6-7/8\" long)",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/bananas?portionid=32977&portionamount=1.000",
              "metric_serving_amount": "101.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "small (6\" to 6-7/8\" long)",
              "calories": "90",
              "carbohydrate": "23.07",
              "protein": "1.10",
              "fat": "0.33",
              "saturated_fat": "0.113",
              "polyunsaturated_fat": "0.074",
              "monounsaturated_fat": "0.032",
              "cholesterol": "0",
              "sodium": "1",
              "potassium": "362",
              "fiber": "2.6",
              "sugar": "12.35",
              "vitamin_a": "3",
              "vitamin_c": "8.8",
              "calcium": "5",
              "iron": "0.26"
            },
            {
              "serving_id": "32979",
              "serving_description": "1 large (8\" to 8-7/8\" long)",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/bananas?portionid=32979&portionamount=1.000",
              "metric_serving_amount": "136.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "large (8\" to 8-7/8\" long)",
              "calories": "121",
              "carbohydrate": "31.06",
              "protein": "1.48",
              "fat": "0.45",
              "saturated_fat": "0.152",
              "polyunsaturated_fat": "0.099",
              "monounsaturated_fat": "0.044",
              "cholesterol": "0",
              "sodium": "1",
              "potassium": "487",
              "fiber": "3.5",
              "sugar": "16.63",
              "vitamin_a": "4",
              "vitamin_c": "11.8",
              "calcium": "7",
              "iron": "0.35"
            },
            {
              "serving_id": "43674",
              "serving_description": "1 oz",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/bananas?portionid=43674&portionamount=1.000",
              "metric_serving_amount": "28.350",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "oz",
              "calories": "25",
              "carbohydrate": "6.48",
              "protein": "0.31",
              "fat": "0.09",
              "saturated_fat": "0.032",
              "polyunsaturated_fat": "0.021",
              "monounsaturated_fat": "0.009",
              "cholesterol": "0",
              "sodium": "0",
              "potassium": "101",
              "fiber": "0.7",
              "sugar": "3.47",
              "vitamin_a": "1",
              "vitamin_c": "2.5",
              "calcium": "1",
              "iron": "0.07"
            },
            {
              "serving_id": "32976",
              "serving_description": "1 extra small (less than 6\" long)",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/bananas?portionid=32976&portionamount=1.000",
              "metric_serving_amount": "81.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "extra small (less than 6\" long)",
              "calories": "72",
              "carbohydrate": "18.50",
              "protein": "0.88",
              "fat": "0.27",
              "saturated_fat": "0.091",
              "polyunsaturated_fat": "0.059",
              "monounsaturated_fat": "0.026",
              "cholesterol": "0",
              "sodium": "1",
              "potassium": "290",
              "fiber": "2.1",
              "sugar": "9.91",
              "vitamin_a": "2",
              "vitamin_c": "7.0",
              "calcium": "4",
              "iron": "0.21"
            },
            {
              "serving_id": "32980",
              "serving_description": "1 extra large (9\" or longer)",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/bananas?portionid=32980&portionamount=1.000",
              "metric_serving_amount": "152.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "extra large (9\" or longer)",
              "calories": "135",
              "carbohydrate": "34.72",
              "protein": "1.66",
              "fat": "0.50",
              "saturated_fat": "0.170",
              "polyunsaturated_fat": "0.111",
              "monounsaturated_fat": "0.049",
              "cholesterol": "0",
              "sodium": "2",
              "potassium": "544",
              "fiber": "4.0",
              "sugar": "18.59",
              "vitamin_a": "5",
              "vitamin_c": "13.2",
              "calcium": "8",
              "iron": "0.40"
            }
          ]
        }
      }
    },
    {
      "food_id": 7350,
      "food_entry_name": "Cappuccino",
      "eaten": {
        "food_name_singular": "cappuccino",
        "food_name_plural": "cappuccinos",
        "singular_description": "",
        "plural_description": "",
        "units": 1.0,
        "metric_description": "ml",
        "total_metric_amount": 240,
        "per_unit_metric_amount": 240,
        "total_nutritional_content": {
          "calories": "75",
          "carbohydrate": "5.89",
          "protein": "4.14",
          "fat": "4.04",
          "saturated_fat": "2.305",
          "polyunsaturated_fat": "0.244",
          "monounsaturated_fat": "1.022",
          "cholesterol": "12",
          "sodium": "51",
          "potassium": "236",
          "fiber": "0.2",
          "sugar": "6.50",
          "vitamin_a": "34",
          "vitamin_c": "0.0",
          "calcium": "146",
          "iron": "0.19"
        }
      },
      "suggested_serving": {
        "serving_id": 1136795,
        "serving_description": "100 ml",
        "metric_serving_description": "g",
        "metric_measure_amount": 101.442,
        "number_of_units": "2.4"
      },
      "food": {
        "food_id": "7350",
        "food_name": "Cappuccino",
        "food_type": "Generic",
        "food_url": "https://www.fatsecret.com/calories-nutrition/generic/cappuccino",
        "servings": {
          "serving": [
            {
              "serving_id": "28300",
              "serving_description": "1 mug (8 fl oz)",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cappuccino?portionid=28300&portionamount=1.000",
              "metric_serving_amount": "240.000",
              "metric_serving_unit": "g",
              "is_default": true,
              "number_of_units": "1.000",
              "measurement_description": "mug (8 fl oz)",
              "calories": "74",
              "carbohydrate": "5.81",
              "protein": "4.08",
              "fat": "3.98",
              "saturated_fat": "2.273",
              "polyunsaturated_fat": "0.241",
              "monounsaturated_fat": "1.007",
              "cholesterol": "12",
              "sodium": "50",
              "potassium": "233",
              "fiber": "0.2",
              "sugar": "6.41",
              "vitamin_a": "34",
              "vitamin_c": "0",
              "calcium": "144",
              "iron": "0.19"
            },
            {
              "serving_id": "1136795",
              "serving_description": "100 ml",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cappuccino?portionid=1136795&portionamount=100.000",
              "metric_serving_amount": "101.442",
              "metric_serving_unit": "g",
              "number_of_units": "100.000",
              "measurement_description": "ml",
              "calories": "31",
              "carbohydrate": "2.45",
              "protein": "1.72",
              "fat": "1.68",
              "saturated_fat": "0.961",
              "polyunsaturated_fat": "0.102",
              "monounsaturated_fat": "0.426",
              "cholesterol": "5",
              "sodium": "21",
              "potassium": "98",
              "fiber": "0.1",
              "sugar": "2.71",
              "vitamin_a": "14",
              "vitamin_c": "0",
              "calcium": "61",
              "iron": "0.08"
            },
            {
              "serving_id": "27229",
              "serving_description": "1 coffee cup (6 fl oz)",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cappuccino?portionid=27229&portionamount=1.000",
              "metric_serving_amount": "180.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "coffee cup (6 fl oz)",
              "calories": "56",
              "carbohydrate": "4.36",
              "protein": "3.06",
              "fat": "2.99",
              "saturated_fat": "1.704",
              "polyunsaturated_fat": "0.180",
              "monounsaturated_fat": "0.756",
              "cholesterol": "9",
              "sodium": "38",
              "potassium": "175",
              "fiber": "0.2",
              "sugar": "4.81",
              "vitamin_a": "25",
              "vitamin_c": "0",
              "calcium": "108",
              "iron": "0.14"
            },
            {
              "serving_id": "56030",
              "serving_description": "100 g",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cappuccino?portionid=56030&portionamount=100.000",
              "metric_serving_amount": "100.000",
              "metric_serving_unit": "g",
              "number_of_units": "100.000",
              "measurement_description": "g",
              "calories": "31",
              "carbohydrate": "2.42",
              "protein": "1.70",
              "fat": "1.66",
              "saturated_fat": "0.947",
              "polyunsaturated_fat": "0.100",
              "monounsaturated_fat": "0.420",
              "cholesterol": "5",
              "sodium": "21",
              "potassium": "97",
              "fiber": "0.1",
              "sugar": "2.67",
              "vitamin_a": "14",
              "vitamin_c": "0",
              "calcium": "60",
              "iron": "0.08"
            },
            {
              "serving_id": "27060",
              "serving_description": "1 medium",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cappuccino?portionid=27060&portionamount=1.000",
              "metric_serving_amount": "486.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "medium",
              "calories": "151",
              "carbohydrate": "11.76",
              "protein": "8.26",
              "fat": "8.07",
              "saturated_fat": "4.602",
              "polyunsaturated_fat": "0.487",
              "monounsaturated_fat": "2.040",
              "cholesterol": "24",
              "sodium": "102",
              "potassium": "471",
              "fiber": "0.5",
              "sugar": "12.98",
              "vitamin_a": "68",
              "vitamin_c": "0",
              "calcium": "292",
              "iron": "0.39"
            },
            {
              "serving_id": "27157",
              "serving_description": "1 large",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cappuccino?portionid=27157&portionamount=1.000",
              "metric_serving_amount": "578.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "large",
              "calories": "179",
              "carbohydrate": "13.99",
              "protein": "9.83",
              "fat": "9.60",
              "saturated_fat": "5.473",
              "polyunsaturated_fat": "0.579",
              "monounsaturated_fat": "2.426",
              "cholesterol": "29",
              "sodium": "121",
              "potassium": "561",
              "fiber": "0.6",
              "sugar": "15.43",
              "vitamin_a": "81",
              "vitamin_c": "0",
              "calcium": "347",
              "iron": "0.46"
            },
            {
              "serving_id": "26732",
              "serving_description": "1 serving (486 g)",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cappuccino?portionid=26732&portionamount=1.000",
              "metric_serving_amount": "486.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "serving (486g)",
              "calories": "151",
              "carbohydrate": "11.76",
              "protein": "8.26",
              "fat": "8.07",
              "saturated_fat": "4.602",
              "polyunsaturated_fat": "0.487",
              "monounsaturated_fat": "2.040",
              "cholesterol": "24",
              "sodium": "102",
              "potassium": "471",
              "fiber": "0.5",
              "sugar": "12.98",
              "vitamin_a": "68",
              "vitamin_c": "0",
              "calcium": "292",
              "iron": "0.39"
            },
            {
              "serving_id": "28637",
              "serving_description": "1 cup (8 fl oz)",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cappuccino?portionid=28637&portionamount=1.000",
              "metric_serving_amount": "240.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "cup (8 fl oz)",
              "calories": "74",
              "carbohydrate": "5.81",
              "protein": "4.08",
              "fat": "3.98",
              "saturated_fat": "2.273",
              "polyunsaturated_fat": "0.241",
              "monounsaturated_fat": "1.007",
              "cholesterol": "12",
              "sodium": "50",
              "potassium": "233",
              "fiber": "0.2",
              "sugar": "6.41",
              "vitamin_a": "34",
              "vitamin_c": "0",
              "calcium": "144",
              "iron": "0.19"
            },
            {
              "serving_id": "26809",
              "serving_description": "1 small",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cappuccino?portionid=26809&portionamount=1.000",
              "metric_serving_amount": "365.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "small",
              "calories": "113",
              "carbohydrate": "8.83",
              "protein": "6.21",
              "fat": "6.06",
              "saturated_fat": "3.456",
              "polyunsaturated_fat": "0.366",
              "monounsaturated_fat": "1.532",
              "cholesterol": "18",
              "sodium": "77",
              "potassium": "354",
              "fiber": "0.4",
              "sugar": "9.75",
              "vitamin_a": "51",
              "vitamin_c": "0",
              "calcium": "219",
              "iron": "0.29"
            },
            {
              "serving_id": "27228",
              "serving_description": "1 fl oz",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cappuccino?portionid=27228&portionamount=1.000",
              "metric_serving_amount": "30.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "fl oz",
              "calories": "9",
              "carbohydrate": "0.73",
              "protein": "0.51",
              "fat": "0.50",
              "saturated_fat": "0.284",
              "polyunsaturated_fat": "0.030",
              "monounsaturated_fat": "0.126",
              "cholesterol": "1",
              "sodium": "6",
              "potassium": "29",
              "fiber": "0",
              "sugar": "0.80",
              "vitamin_a": "4",
              "vitamin_c": "0",
              "calcium": "18",
              "iron": "0.02"
            }
          ]
        }
      }
    },
    {
      "food_id": 38821,
      "food_entry_name": "Toasted White Bread",
      "eaten": {
        "food_name_singular": "toast",
        "food_name_plural": "toasts",
        "singular_description": "",
        "plural_description": "",
        "units": 1.0,
        "metric_description": "g",
        "total_metric_amount": 30.0,
        "per_unit_metric_amount": 30,
        "total_nutritional_content": {
          "calories": "88",
          "carbohydrate": "16.32",
          "protein": "2.70",
          "fat": "1.20",
          "saturated_fat": "0.173",
          "polyunsaturated_fat": "0.627",
          "monounsaturated_fat": "0.239",
          "cholesterol": "0",
          "sodium": "178",
          "potassium": "39",
          "fiber": "0.8",
          "sugar": "1.42",
          "vitamin_a": "0",
          "vitamin_c": "0",
          "calcium": "36",
          "iron": "1.00"
        }
      },
      "suggested_serving": {
        "serving_id": 38646,
        "serving_description": "1 slice",
        "metric_serving_description": "g",
        "metric_measure_amount": 22.000,
        "number_of_units": "1.364"
      },
      "food": {
        "food_id": "38821",
        "food_name": "Toasted White Bread",
        "food_type": "Generic",
        "food_url": "https://www.fatsecret.com/calories-nutrition/usda/toasted-white-bread",
        "servings": {
          "serving": [
            {
              "serving_id": "38646",
              "serving_description": "1 slice",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/toasted-white-bread?portionid=38646&portionamount=1.000",
              "metric_serving_amount": "22.000",
              "metric_serving_unit": "g",
              "is_default": true,
              "number_of_units": "1.000",
              "measurement_description": "slice",
              "calories": "64",
              "carbohydrate": "11.97",
              "protein": "1.98",
              "fat": "0.88",
              "saturated_fat": "0.127",
              "polyunsaturated_fat": "0.460",
              "monounsaturated_fat": "0.175",
              "cholesterol": "0",
              "sodium": "130",
              "potassium": "29",
              "fiber": "0.6",
              "sugar": "1.04",
              "vitamin_a": "0",
              "vitamin_c": "0.0",
              "calcium": "26",
              "iron": "0.73"
            },
            {
              "serving_id": "61552",
              "serving_description": "100 g",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/toasted-white-bread?portionid=61552&portionamount=100.000",
              "metric_serving_amount": "100.000",
              "metric_serving_unit": "g",
              "number_of_units": "100.000",
              "measurement_description": "g",
              "calories": "293",
              "carbohydrate": "54.40",
              "protein": "9.00",
              "fat": "4.00",
              "saturated_fat": "0.578",
              "polyunsaturated_fat": "2.090",
              "monounsaturated_fat": "0.796",
              "cholesterol": "1",
              "sodium": "592",
              "potassium": "131",
              "fiber": "2.5",
              "sugar": "4.74",
              "vitamin_a": "0",
              "vitamin_c": "0.0",
              "calcium": "119",
              "iron": "3.33"
            },
            {
              "serving_id": "38641",
              "serving_description": "1 slice large",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/toasted-white-bread?portionid=38641&portionamount=1.000",
              "metric_serving_amount": "27.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "slice, large",
              "calories": "79",
              "carbohydrate": "14.69",
              "protein": "2.43",
              "fat": "1.08",
              "saturated_fat": "0.156",
              "polyunsaturated_fat": "0.564",
              "monounsaturated_fat": "0.215",
              "cholesterol": "0",
              "sodium": "160",
              "potassium": "35",
              "fiber": "0.7",
              "sugar": "1.28",
              "vitamin_a": "0",
              "vitamin_c": "0.0",
              "calcium": "32",
              "iron": "0.90"
            },
            {
              "serving_id": "38643",
              "serving_description": "1 slice, thin",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/toasted-white-bread?portionid=38643&portionamount=1.000",
              "metric_serving_amount": "17.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "slice, thin",
              "calories": "50",
              "carbohydrate": "9.25",
              "protein": "1.53",
              "fat": "0.68",
              "saturated_fat": "0.098",
              "polyunsaturated_fat": "0.355",
              "monounsaturated_fat": "0.135",
              "cholesterol": "0",
              "sodium": "101",
              "potassium": "22",
              "fiber": "0.4",
              "sugar": "0.81",
              "vitamin_a": "0",
              "vitamin_c": "0.0",
              "calcium": "20",
              "iron": "0.57"
            }
          ]
        }
      }
    },
    {
      "food_id": 35144,
      "food_entry_name": "Sliced Ham  (Regular, Approx. 11% Fat)",
      "eaten": {
        "food_name_singular": "ham",
        "food_name_plural": "hams",
        "singular_description": "",
        "plural_description": "",
        "units": 1.0,
        "metric_description": "g",
        "total_metric_amount": 50.0,
        "per_unit_metric_amount": 50,
        "total_nutritional_content": {
          "calories": "82",
          "carbohydrate": "1.92",
          "protein": "8.30",
          "fat": "4.30",
          "saturated_fat": "1.468",
          "polyunsaturated_fat": "0.394",
          "monounsaturated_fat": "2.177",
          "cholesterol": "29",
          "sodium": "652",
          "potassium": "144",
          "fiber": "0.6",
          "sugar": "0",
          "vitamin_a": "0",
          "vitamin_c": "2.0",
          "calcium": "12",
          "iron": "0.51"
        }
      },
      "suggested_serving": {
        "serving_id": 32248,
        "serving_description": "1 serving 2 slices",
        "metric_serving_description": "g",
        "metric_measure_amount": 56.000,
        "number_of_units": "0.893"
      },
      "food": {
        "food_id": "35144",
        "food_name": "Sliced Ham  (Regular, Approx. 11% Fat)",
        "food_type": "Generic",
        "food_url": "https://www.fatsecret.com/calories-nutrition/usda/sliced-ham--(regular-approx-11%25-fat)",
        "servings": {
          "serving": [
            {
              "serving_id": "32248",
              "serving_description": "1 serving 2 slices",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/sliced-ham--(regular-approx-11%25-fat)?portionid=32248&portionamount=1.000",
              "metric_serving_amount": "56.000",
              "metric_serving_unit": "g",
              "is_default": true,
              "number_of_units": "1.000",
              "measurement_description": "serving 2 slices",
              "calories": "91",
              "carbohydrate": "2.14",
              "protein": "9.30",
              "fat": "4.82",
              "saturated_fat": "1.644",
              "polyunsaturated_fat": "0.442",
              "monounsaturated_fat": "2.438",
              "cholesterol": "32",
              "sodium": "730",
              "potassium": "161",
              "fiber": "0.7",
              "sugar": "0.00",
              "vitamin_a": "0",
              "vitamin_c": "2.2",
              "calcium": "13",
              "iron": "0.57"
            },
            {
              "serving_id": "57875",
              "serving_description": "100 g",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/sliced-ham--(regular-approx-11%25-fat)?portionid=57875&portionamount=100.000",
              "metric_serving_amount": "100.000",
              "metric_serving_unit": "g",
              "number_of_units": "100.000",
              "measurement_description": "g",
              "calories": "163",
              "carbohydrate": "3.83",
              "protein": "16.60",
              "fat": "8.60",
              "saturated_fat": "2.936",
              "polyunsaturated_fat": "0.789",
              "monounsaturated_fat": "4.354",
              "cholesterol": "57",
              "sodium": "1304",
              "potassium": "287",
              "fiber": "1.3",
              "sugar": "0.00",
              "vitamin_a": "0",
              "vitamin_c": "4.0",
              "calcium": "24",
              "iron": "1.02"
            },
            {
              "serving_id": "32249",
              "serving_description": "1 slice",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/sliced-ham--(regular-approx-11%25-fat)?portionid=32249&portionamount=1.000",
              "metric_serving_amount": "28.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "slice",
              "calories": "46",
              "carbohydrate": "1.07",
              "protein": "4.65",
              "fat": "2.41",
              "saturated_fat": "0.822",
              "polyunsaturated_fat": "0.221",
              "monounsaturated_fat": "1.219",
              "cholesterol": "16",
              "sodium": "365",
              "potassium": "80",
              "fiber": "0.4",
              "sugar": "0.00",
              "vitamin_a": "0",
              "vitamin_c": "1.1",
              "calcium": "7",
              "iron": "0.29"
            },
            {
              "serving_id": "43104",
              "serving_description": "1 oz",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/usda/sliced-ham--(regular-approx-11%25-fat)?portionid=43104&portionamount=1.000",
              "metric_serving_amount": "28.350",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "oz",
              "calories": "46",
              "carbohydrate": "1.09",
              "protein": "4.71",
              "fat": "2.44",
              "saturated_fat": "0.832",
              "polyunsaturated_fat": "0.224",
              "monounsaturated_fat": "1.234",
              "cholesterol": "16",
              "sodium": "370",
              "potassium": "81",
              "fiber": "0.4",
              "sugar": "0.00",
              "vitamin_a": "0",
              "vitamin_c": "1.1",
              "calcium": "7",
              "iron": "0.29"
            }
          ]
        }
      }
    },
    {
      "food_id": 1240,
      "food_entry_name": "Cheese",
      "eaten": {
        "food_name_singular": "cheese",
        "food_name_plural": "cheeses",
        "singular_description": "",
        "plural_description": "",
        "units": 1.0,
        "metric_description": "g",
        "total_metric_amount": 20.0,
        "per_unit_metric_amount": 20,
        "total_nutritional_content": {
          "calories": "70",
          "carbohydrate": "0.94",
          "protein": "4.44",
          "fat": "5.38",
          "saturated_fat": "3.322",
          "polyunsaturated_fat": "0.191",
          "monounsaturated_fat": "1.533",
          "cholesterol": "17",
          "sodium": "191",
          "potassium": "37",
          "fiber": "0",
          "sugar": "0.71",
          "vitamin_a": "42",
          "vitamin_c": "0.0",
          "calcium": "130",
          "iron": "0.10"
        }
      },
      "suggested_serving": {
        "serving_id": 49920,
        "serving_description": "100 g",
        "metric_serving_description": "g",
        "metric_measure_amount": 100.000,
        "number_of_units": "0.2"
      },
      "food": {
        "food_id": "1240",
        "food_name": "Cheese",
        "food_type": "Generic",
        "food_url": "https://www.fatsecret.com/calories-nutrition/generic/cheese",
        "servings": {
          "serving": [
            {
              "serving_id": "49920",
              "serving_description": "100 g",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cheese?portionid=49920&portionamount=100.000",
              "metric_serving_amount": "100.000",
              "metric_serving_unit": "g",
              "is_default": true,
              "number_of_units": "100.000",
              "measurement_description": "g",
              "calories": "350",
              "carbohydrate": "4.71",
              "protein": "22.21",
              "fat": "26.91",
              "saturated_fat": "16.609",
              "polyunsaturated_fat": "0.956",
              "monounsaturated_fat": "7.664",
              "cholesterol": "83",
              "sodium": "955",
              "potassium": "187",
              "fiber": "0",
              "sugar": "3.54",
              "vitamin_a": "210",
              "vitamin_c": "0.0",
              "calcium": "651",
              "iron": "0.51"
            },
            {
              "serving_id": "2074",
              "serving_description": "1 slice",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cheese?portionid=2074&portionamount=1.000",
              "metric_serving_amount": "24.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "slice",
              "calories": "84",
              "carbohydrate": "1.13",
              "protein": "5.33",
              "fat": "6.46",
              "saturated_fat": "3.986",
              "polyunsaturated_fat": "0.229",
              "monounsaturated_fat": "1.839",
              "cholesterol": "20",
              "sodium": "229",
              "potassium": "45",
              "fiber": "0",
              "sugar": "0.85",
              "vitamin_a": "50",
              "vitamin_c": "0.0",
              "calcium": "156",
              "iron": "0.12"
            },
            {
              "serving_id": "180460",
              "serving_description": "1 oz",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cheese?portionid=180460&portionamount=1.000",
              "metric_serving_amount": "28.350",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "oz",
              "calories": "99",
              "carbohydrate": "1.34",
              "protein": "6.30",
              "fat": "7.63",
              "saturated_fat": "4.709",
              "polyunsaturated_fat": "0.271",
              "monounsaturated_fat": "2.173",
              "cholesterol": "24",
              "sodium": "271",
              "potassium": "53",
              "fiber": "0",
              "sugar": "1.00",
              "vitamin_a": "60",
              "vitamin_c": "0.0",
              "calcium": "185",
              "iron": "0.14"
            },
            {
              "serving_id": "2363",
              "serving_description": "1 serving (24 g)",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cheese?portionid=2363&portionamount=1.000",
              "metric_serving_amount": "24.000",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "serving (24g)",
              "calories": "84",
              "carbohydrate": "1.13",
              "protein": "5.33",
              "fat": "6.46",
              "saturated_fat": "3.986",
              "polyunsaturated_fat": "0.229",
              "monounsaturated_fat": "1.839",
              "cholesterol": "20",
              "sodium": "229",
              "potassium": "45",
              "fiber": "0",
              "sugar": "0.85",
              "vitamin_a": "50",
              "vitamin_c": "0.0",
              "calcium": "156",
              "iron": "0.12"
            },
            {
              "serving_id": "2075",
              "serving_description": "1 cubic inch",
              "serving_url": "https://www.fatsecret.com/calories-nutrition/generic/cheese?portionid=2075&portionamount=1.000",
              "metric_serving_amount": "17.300",
              "metric_serving_unit": "g",
              "number_of_units": "1.000",
              "measurement_description": "cubic inch",
              "calories": "61",
              "carbohydrate": "0.81",
              "protein": "3.84",
              "fat": "4.66",
              "saturated_fat": "2.873",
              "polyunsaturated_fat": "0.165",
              "monounsaturated_fat": "1.326",
              "cholesterol": "14",
              "sodium": "165",
              "potassium": "32",
              "fiber": "0",
              "sugar": "0.61",
              "vitamin_a": "36",
              "vitamin_c": "0.0",
              "calcium": "113",
              "iron": "0.09"
            }
          ]
        }
      }
    }
  ]
}
Error Codes
CODE	TYPE	DESCRIPTION
1	General	An unknown error occurred: '<details>'
2	OAuth 1.0	Missing required oauth parameter: '<details>'
3	OAuth 1.0	Unsupported oauth parameter: '<details>'
4	OAuth 1.0	Invalid signature method: '<details>'
5	OAuth 1.0	Invalid consumer key: '<details>'
6	OAuth 1.0	Invalid/expired timestamp: '<details>'
7	OAuth 1.0	Invalid/used nonce: '<details>'
8	OAuth 1.0	Invalid signature: '<details>'
9	OAuth 1.0	Invalid access token: '<details>'
12	General	User is performing too many actions: '<details>'
13	OAuth 2.0	Invalid token: '<details>'
14	OAuth 2.0	Missing scope: '<details>'
23	General	Api not found
24	General	A timeout has occurred
101	Parameter	Missing required parameter: '<details>'
107	Parameter	Value out of range: '<details>'
109	Parameter	Character limit exceeded: '<details>'
211	Application	No food item detected