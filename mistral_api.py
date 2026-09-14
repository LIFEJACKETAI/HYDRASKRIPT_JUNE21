import os

from mistralai.client import Mistral

client = Mistral(api_key=os.environ.get("C4K7RA0lUc8KRbS2c2Ooizo75WatCJmU"))

inputs = [
    {"role":"user","content":"Hello!"}
]

response = client.beta.conversations.start(
    agent_id="ag_01a09cdb4a4270568dbc55d2a6bd1f5e",
    agent_version=0,
    inputs=inputs,
)

print(response)