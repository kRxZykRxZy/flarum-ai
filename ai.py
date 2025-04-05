import requests
from transformers import pipeline
import json

# Flarum Forum URL and Login Credentials
flarum_url = 'https://sch.flarum.cloud'
username = 'your_username'
password = 'your_password'

# Initialize GPT-2 for text generation (you can change this model if needed)
generator = pipeline('text-generation', model='gpt2')

# Function to authenticate with Flarum
def authenticate_flarum():
    session = requests.Session()
    login_url = f'{flarum_url}/api/tokens'
    login_payload = {
        'data': {
            'attributes': {
                'username': username,
                'password': password
            }
        }
    }

    headers = {
        'Content-Type': 'application/vnd.api+json',
    }

    # Send login request
    response = session.post(login_url, headers=headers, data=json.dumps(login_payload))

    if response.status_code == 200:
        token = response.json()['data']['attributes']['token']
        session.headers.update({'Authorization': f'Bearer {token}'})
        print("Authenticated successfully!")
        return session
    else:
        print(f"Failed to authenticate: {response.text}")
        return None

# Function to fetch all posts from the forum
def fetch_posts(session):
    posts_url = f'{flarum_url}/api/discussions'
    response = session.get(posts_url)

    if response.status_code == 200:
        posts = response.json()['data']
        return posts
    else:
        print(f"Failed to fetch posts: {response.text}")
        return []

# Function to generate AI response
def get_ai_response(prompt):
    # Generate a response from GPT-2 (or another model)
    response = generator(prompt, max_length=100, num_return_sequences=1)
    return response[0]['generated_text']

# Function to post an answer to Flarum with custom message
def post_answer(session, discussion_id, answer):
    # Append the custom message
    answer_with_message = f"{answer}\n\nANSWER\n\nTHIS WAS SENT VIA KRXZY_KRXZY'S AI ASSISTANT"

    post_url = f'{flarum_url}/api/posts'
    answer_payload = {
        'data': {
            'type': 'posts',
            'attributes': {
                'content': answer_with_message
            },
            'relationships': {
                'discussion': {
                    'data': {
                        'type': 'discussions',
                        'id': discussion_id
                    }
                }
            }
        }
    }

    headers = {
        'Content-Type': 'application/vnd.api+json',
    }

    response = session.post(post_url, headers=headers, data=json.dumps(answer_payload))

    if response.status_code == 201:
        print("Answer posted successfully!")
    else:
        print(f"Failed to post answer: {response.text}")

# Function to process and answer questions
def process_questions_and_answer(session):
    posts = fetch_posts(session)

    for post in posts:
        # Check if the post is a question by looking for a question mark
        if '?' in post['attributes']['content']:
            question = post['attributes']['content']
            print(f"Found question: {question}")
            answer = get_ai_response(question)
            print(f"Answer: {answer}")
            # Post the answer back to the forum
            discussion_id = post['relationships']['discussion']['data']['id']
            post_answer(session, discussion_id, answer)

# Main function
if __name__ == "__main__":
    session = authenticate_flarum()
    if session:
        process_questions_and_answer(session)
