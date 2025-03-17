#!/usr/bin/env python3
from bottle import route, run, response, template
import sys
import json
import urllib.request, urllib.parse, urllib.error
import urllib.request, urllib.error, urllib.parse
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

def getJSONData():
    if time.time() - os.path.getmtime(JSON_FILE) >= 60:
        try:
            req = urllib.request.Request(REDDIT_API, None, { 'User-Agent' : 'Blinken.org/1.0' })
            data = urllib.request.urlopen(req, timeout=2.0).read()
            obj = json.loads(data)
            if 'error' not in obj: # got good data, update cache
                with open(JSON_FILE, 'wb') as f:
                    f.write(data)
                return obj
        except Exception as e:
            print("Reddit API error, falling back to cache:", e)
            os.utime(JSON_FILE, None) 
    try: # use cache
        with open(JSON_FILE, 'rb') as f:
            return json.loads(f.read())
    except e:
        print("Error reading cache:", e)
    return {}

def getGallery():
    entries = []
    for child in getJSONData()['data']['children']:
        c = child['data']
        if c['is_self']:
            continue
        e = getEntry(c)
        if e:
            entries += [e]
    return entries

def getEntry(o):
    e = {}
    e['title'] = o['title']
    e['author'] = o['author']
    e['permalink'] = o['permalink']
    url = o['url']

    m = re.search('^https?://(.+)$', url)
    if not m:
        return None
    url = m.group(1)
    print(url)
    
    # *jsbin.com/[id]/[optional version]
    # jsfiddle.com/[optional user]/[id]/[optional version]
    m = re.search('^[a-z0-9\-\.]*jsbin\.com/([A-Za-z0-9]+)(?:/([0-9]+))?', url)
    if m:
        print(m.group(1), m.group(2))
    m = re.search('^[a-z0-9\-\.]*(?:jsfiddle\.net|fiddle\.jshell\.net)/([^/]+)/([^/]+)', url)
    if m:
        print(m.group(1), m.group(2))
    x = url.split('://')
    if len(x) < 2 or x[0] not in ['http', 'https']:
        return None
    p = x[1].split('/')
    if len(p) < 2:
        return None
    host, path = p[0], p[1:]
    if host.endswith('jsbin.com'):
        print(path[0])
    elif host.endswith('jsfiddle.net') or host.endswith('fiddle.jshell.net'):
        print(path[1])

    print(url)
    
    url = url.replace('wezuzoho', 'torijef') # fix Blazers
    url = url.replace('joviqivido', 'zanutiy') # fix Standard Sort
    if e['permalink'] in [
            '/r/bbbblinken/comments/22nlsp/drunk_hyperactive_ant/',
            '/r/bbbblinken/comments/1sugj4/christmas_blinken/'
    ]:
        return None # program is lost

    return e

def update_url(url):
    url = url.replace('wezuzoho', 'torijef') # fix Blazers
    url = url.replace('joviqivido', 'zanutiy') # fix Standard Sort
    return url

def show_url(url):
    url = update_url(url)
    if url.startswith('https://output.jsbin.com'):
        url = url.replace('//output.', '//')

    if url.startswith('http://jsbin.com/') or url.startswith('https://jsbin.com/'):
        if '/edit' in url:
            url = url[0:url.index('/edit')]
        if url.endswith('/show'):
            url = url[0:url.rindex('/show')]

        if not(url.endswith('/')):
            url += '/'
        return url + 'embed?output'
    elif (url.startswith('http://fiddle.jshell.net/') or url.startswith('http://jsfiddle.net/') or url.startswith('https://fiddle.jshell.net/') or url.startswith('https://jsfiddle.net/')) and not((url.endswith('/show/') or url.endswith('/show'))):
        return url + '/show/'
    else:
        return url

def code_url(url):
    url = update_url(url)
    if url.startswith('http://output.jsbin.com') or url.startswith('https://output.jsbin.com'):
        url = url.replace('//output.', '//')

    if (url.startswith('http://jsbin.com/') or url.startswith('https://jsbin.com/')) and not url.endswith('/edit'):
        return url.rstrip('/') + '/edit'
    elif (url.startswith('http://fiddle.jshell.net/') or url.startswith('http://jsfiddle.net/') or url.startswith('https://fiddle.jshell.net/') or url.startswith('https://jsfiddle.net/')) and (url.endswith('/show') or url.endswith('/show/')):
        return url.replace('/show', '')
    else:
        return url

@route('/gallery/preview/<hash>')
def code(hash):
    cache_fn = "cache/" + hash
    if os.path.isfile(cache_fn):
        with open(cache_fn, 'r') as f:
            buf = f.read()
            return '<html><script src="https://blinken.org/client.js"></script></head><body><script>' + buf + '</script></body></html>'

# will call urllib2.urlopen/read 
def js_code(url):
    cache_fn = "cache/" + hashlib.sha256(url.encode()).hexdigest()
    if os.path.isfile(cache_fn):
          f = open(cache_fn, 'r')
          buf = f.read()
          f.close()
          return buf

    print("getting code for",url)
      
    if url.startswith('http://output.jsbin.com') or url.startswith('https://output.jsbin.com'):
          url = url.replace('//output.', '//')

    # http://jsbin.com/oWOfadIM/73/edit?html,js,output -> http://jsbin.com/oWOfadIM/73/js
    if url.startswith('http://jsbin.com/') or url.startswith('https://jsbin.com/'):
        url = url.replace('http://', 'https://')
        if '/show' in url or '/edit' in url or '/embed' in url:
            js_url = url[0:url.rindex('/')] + '/js'
        else:
            if url.endswith('/'):
                js_url = url + 'js'
            else:
                js_url = url + '/js'

        print('js_url: ' + js_url)
        try:
            req = urllib.request.Request(js_url, None, { 'User-Agent' : 'Mozilla/5.0' })
            resp = urllib.request.urlopen(req)
        except Exception as e:
            print(e)
            return None
        buf = resp.read()

    elif (url.startswith('http://fiddle.jshell.net/') or url.startswith('http://jsfiddle.net/') or url.startswith('https://fiddle.jshell.net/') or url.startswith('https://jsfiddle.net/')):
        path = url[8:].split('/')
        if len(path) < 2:
            return None
        js_url = 'https://jsfiddle.net/%s/embedded/js/' % (path[2])
        try:
            resp = urllib.request.urlopen(js_url, timeout=5.0)
        except Exception as e:
            print(e)
            return None
        js_page = resp.read()
        js_start_tag = '<pre class="tCont active">'
        js_start = js_page.index(js_start_tag)
        js_end = js_page.index('</pre>', js_start)

        buf = html.unescape(js_page[js_start+len(js_start_tag):js_end])
         
    else:
        resp = urllib.request.urlopen(url)
        buf = resp.read()

    print(f"writing {cache_fn}", file=sys.stderr)
    f = open(cache_fn, 'wb')
    f.write(buf)
    f.close()
    return buf

def validShow(child):
    c = child['data']
    if c['is_self']:
        return False
    if c['title'] == 'Drunk Hyperactive Ant' or \
       c['title'] == 'Christmas Blinken!':
        return False # program is lost
    return True

@route('/gallery')
@route('/gallery/')
@route('/gallery/<page_s>')
def index(page_s='0'):
    page = int(page_s)

    obj = getJSONData()

    idx = -1
    hit_index = False
    more_pages = False
    items = []
    h = html.parser.HTMLParser()
    print(len(obj['data']['children']))
    for child in obj['data']['children']:
        if not validShow(child):
            continue
        c = child['data']
        url = show_url(c['url'])
        idx += 1
        if not(idx in range(page*PER_PAGE, (page+1)*PER_PAGE)):
            if hit_index:
                more_pages = True
            continue
        hit_index = True
        c['code_url'] = code_url(c['url'])
        c['show_url'] = url.replace('http://', 'https://')
        c['preview_hash'] = hashlib.sha256(url.encode()).hexdigest()
        c['title'] = html.unescape(c['title'])
        js_code(url) # warm up cache
        items += [c]

    return template('index', items=items, page=page, more_pages=more_pages)

@route('/api/0/random')
def getrandom():
    print('getrandom req...')
    getGallery()
    obj = getJSONData()

    candidates = []
    for child in obj['data']['children']:
        if not validShow(child):
            continue
        c = child['data']
        if c['is_self']:
            continue
        candidates.append(c)
 
    winner = random.choice(candidates)
    url = show_url(winner['url'])

    response.set_header('Content-Type', 'application/javascript')
    
    output = {}
    output['code'] = js_code(url)
    output['url'] = url
    output['title'] = winner['title']
    return json.dumps(output)

run(host='localhost', port=3001)
