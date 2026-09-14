import requests
import os

api_key = os.environ.get("GROQ_API_KEY")
url = "https://api.groq.com/openai/v1/models"

headers = {
    "Authorization": f"Bearer {"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"}",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)

print(response.json())