import os
import sys
import urllib.parse
import webbrowser
import httpx
from http.server import BaseHTTPRequestHandler, HTTPServer
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

PORT = 8080
REDIRECT_URI = f"http://localhost:{PORT}/callback"
TOKEN_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".strava_tokens.json")

# Global variable to store the authorization code
auth_code = None

class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        parsed_url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        
        if parsed_url.path == "/callback":
            if "code" in query_params:
                auth_code = query_params["code"][0]
                self.send_response(200)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(b"<h1>Authorization Successful!</h1><p>You can close this tab and return to the terminal.</p>")
            else:
                self.send_response(400)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(b"<h1>Authorization Failed</h1><p>No authorization code found in the callback.</p>")
        else:
            self.send_response(404)
            self.end_headers()

def run_local_server():
    server = HTTPServer(("localhost", PORT), CallbackHandler)
    print(f"Waiting for authorization callback on port {PORT}...")
    while auth_code is None:
        server.handle_request()
    server.server_close()

def main():
    client_id = os.getenv("STRAVA_CLIENT_ID")
    client_secret = os.getenv("STRAVA_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        print("Error: STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET not found in .env.")
        client_id = input("Enter your Strava Client ID: ").strip()
        client_secret = input("Enter your Strava Client Secret: ").strip()
        
        if not client_id or not client_secret:
            print("Credentials are required to continue.")
            sys.exit(1)
            
    # Form authorization URL
    params = {
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": "activity:read_all,profile:read_all"
    }
    auth_url = "https://www.strava.com/oauth/authorize?" + urllib.parse.urlencode(params)
    
    print("\nOpening your web browser to authorize Life-OS with Strava...")
    print(f"URL: {auth_url}\n")
    webbrowser.open(auth_url)
    
    # Start local server to listen for the redirect callback
    run_local_server()
    
    if not auth_code:
        print("Error: Failed to obtain authorization code.")
        sys.exit(1)
        
    print(f"Authorization code received: {auth_code}")
    print("Exchanging authorization code for tokens...")
    
    # Exchange code for token
    token_url = "https://www.strava.com/oauth/token"
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": auth_code,
        "grant_type": "authorization_code"
    }
    
    try:
        response = httpx.post(token_url, data=payload)
        response.raise_for_status()
        token_data = response.json()
        
        # Save tokens
        import json
        with open(TOKEN_FILE, "w") as f:
            json.dump({
                "client_id": client_id,
                "client_secret": client_secret,
                "access_token": token_data["access_token"],
                "refresh_token": token_data["refresh_token"],
                "expires_at": token_data["expires_at"]
            }, f, indent=4)
            
        print(f"\nSuccess! Tokens saved to: {TOKEN_FILE}")
        print("You are now authenticated with Strava. You can run the sync worker next.")
    except Exception as e:
        print(f"\nError exchanging token: {e}")
        if 'response' in locals() and response is not None:
            print(f"Response details: {response.text}")
        sys.exit(1)

if __name__ == "__main__":
    main()
