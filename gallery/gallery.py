#!/usr/bin/env python3
from bottle import route, run, response, template, abort
import sys
import json
import urllib.request
import random
import html
import html.parser
import os
import time
import hashlib
import re

JSON_FILE = 'cache/bbbblinken.json.last'
REDDIT_API = 'https://www.reddit.com/r/bbbblinken/top.json?sort=top&t=all&limit=100'
PER_PAGE=6

import praw

# Uses credentials from praw.ini
reddit = praw.Reddit()

def getPosts():
    """
    Retrieve top 100 posts from our subreddit and stores in local json cache file.

    Returns: list of dicts with the fields shown below
    """
    if time.time() - os.path.getmtime(JSON_FILE) > 300:        
        try:
            print("Getting data from reddit", file=sys.stderr)
            posts=reddit.subreddit("bbbblinken").new()
            data = [
                {
                    "title": post.title,
                    "author": post.author.name,
                    "permalink": post.permalink,
                    "url": post.url,
                    "selftext": post.selftext,
                }
                for post in posts]
            print("Success, updated cache", file=sys.stderr)
            with open(JSON_FILE, 'w') as f:
                f.write(json.dumps(data))
            return data
        except Exception as e:
            print("Reddit API error, falling back to cache:", e, file=sys.stderr)
            os.utime(JSON_FILE, None)
    try:
        with open(JSON_FILE, 'r') as f:
            return json.loads(f.read())
    except e:
        print("Error reading cache:", e, file=sys.stderr)
        return []

def getEntryPosts(posts):
    """
    Gets posts that have valid code URLs
    """
    res = []
    for post in posts:
        if post["title"] == "Christmas Blinken!":
            # Code is lost :(
            continue
        if not addURLs(post):
            continue
        code, post['cache_key'] = getCode(post['code_url'])
        if not code:
            continue
        res += [post]
    return res

def addURLs(post):
    """
    Add post and show urls to post and return True if present
    """
    for bin_provider in [BinProviderJSBin(), BinProviderJSFiddle()]:
        for text in [post["url"], post["selftext"]]:
            base_url = bin_provider.baseURL(text)
            if base_url:
                post["base_url"] = base_url
                post["code_url"] = bin_provider.codeURL(base_url)
                return True
    return False

class BinProvider:
    url_re = None

    def baseURL(self, text):
        """
        return provider's base url if contained in text
        """

        # Match URL with subclass's regexp
        if not self.url_re:
            return None
        m = re.search(self.url_re, text)
        if not m:
            return None
        url = m[0]
        
        # Upgrade http
        x = url.split('://')
        if len(x) < 2 or x[0].lower() not in ['http', 'https']:
            return None
        if x[0].lower() == "http":
            url = "https://" + x[1]

        # Some hard-coded fixes
        url = url.replace('wezuzoho', 'torijef') # fix Blazers
        url = url.replace('joviqivido', 'zanutiy') # fix Standard Sort
        
        return url

    def codeURL(self, url):
        return url
    
class BinProviderJSFiddle(BinProvider):
    url_re = 'https?://(?:[a-z0-9\\-.]*.)?(?:jsfiddle\\.net|fiddle\\.jshell\\.net)/([A-Za-z0-9]+)/([A-Za-z0-9]+)'

    def baseURL(self, text):
        url = super().baseURL(text)
        if not url:
            return None
        if url.startswith('https://fiddle.jshell.net'):
            url = url.replace('fiddle.jshell.net', 'jsfiddle.net')        
        return url

    def codeURL(self, base_url):
        path = base_url[8:].split('/')
        if len(path) < 2:
            return None
        return f'https://jsfiddle.net/{path[1]}/{path[2]}/embedded/js/'
    
class BinProviderJSBin(BinProvider):
    url_re = 'https?://(?:[a-z0-9\\-.]*.)?jsbin\\.com/([A-Za-z0-9]+)(?:/([0-9]+))?'

    def baseURL(self, text):
        url = super().baseURL(text)
        if not url:
            return None
        if url.endswith('/edit'):
            url = url[0:url.index('/edit')]
        if url.endswith('/show'):
            url = url[0:url.rindex('/show')]        
        if url.startswith('https://output.jsbin.com'):
            url = url.replace('output.', '')
        return url

    def codeURL(self, base_url):
        if base_url.endswith('/'):
            base_url = base_url[:-1]
        return base_url + '/download'


def getCode(code_url):
    cache_key = hashlib.sha256(code_url.encode()).hexdigest()
    cache_fn = "cache/" + cache_key
    if os.path.isfile(cache_fn):
        with open(cache_fn, "r") as f:
          return f.read(), cache_key
    try:
        if "jsfiddle" in code_url:
            # Don't bother trying, they suck!
            raise Exception("JSFiddle sucks!")
        time.sleep(0.1)
        data = urllib.request.urlopen(code_url).read().decode()
    except Exception as e:
        print(f"Couldn't download {code_url} to {cache_fn}:", e, file=sys.stderr)
        return None, None
    jsbin_start = '<script id=\"jsbin-javascript\">'
    jsbin_end = '</script>'
    if jsbin_start in data:
        data = data[data.index(jsbin_start) + len(jsbin_start):]
        if jsbin_end in data:
            data = data[0:data.index(jsbin_end)]
    with open(cache_fn, "w") as f:
        f.write(data)   
    return data, cache_key
        
@route('/gallery/preview/<cache_key>')
def preview(cache_key):
    cache_fn = "cache/" + cache_key
    if os.path.isfile(cache_fn):
        with open(cache_fn, 'r') as f:
            buf = f.read()
        return '<html><script src="https://blinken.org/client.js"></script></head><body><script>' + buf + '</script></body></html>'
    abort(404, "File not found.")

def validShow(post):
    if post['title'] == 'Drunk Hyperactive Ant' or \
['title'] == 'Christmas Blinken!':
        return False # program is lost
    return True

@route('/gallery')
@route('/gallery/')
@route('/gallery/<page_s>')
def index(page_s='0'):
    page = int(page_s)
    hit_index = False
    more_pages = False
    items = []
    index = -1
    for post in getEntryPosts(getPosts()):
        index += 1
        if index < page*PER_PAGE or index >= (page+1)*PER_PAGE:
            if hit_index:
                more_pages = True
            continue
        hit_index = True
        items += [post]

    return template('index', items=items, page=page, more_pages=more_pages)

@route('/api/0/random')
def getrandom():
    candidates = getEntryPosts(getPosts())
    winner = random.choice(candidates)
    code, _ = getCode(winner['code_url'])    

    response.set_header('Content-Type', 'application/javascript')

    return json.dumps({
        'title': winner['title'],
        'url': winner['base_url'],
        'code': code,
    })

run(host='localhost', port=3001)
