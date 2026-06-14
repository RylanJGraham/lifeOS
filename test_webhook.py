import requests
print(requests.post('http://127.0.0.1:8000/webhook', json={'message': {'chat': {'id': 123}, 'text': 'test'}}).text)
