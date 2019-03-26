#!/usr/bin/env python
from bottle import route, run, response, template
import json
import urllib
import urllib2
import random
import HTMLParser
import os
import time
import hashlib

JSON_FILE = 'cache/bbbblinken.json.last'
PER_PAGE=6

def get_cached_json():
    try:
        with open(JSON_FILE, 'r') as f:
            obj = json.loads(f.read())
    except:
        return {}
    return obj

def get_bbbblinken_json():
    diff = time.time() - os.path.getmtime(JSON_FILE)
    print '%s seconds since last...' % (str(diff))
    if (diff < 60):
        return get_cached_json()

    try:
        req = urllib2.Request("https://www.reddit.com/r/bbbblinken/top.json?sort=top&t=all&limit=100", None, { 'User-Agent' : 'Blinken.org/1.0' })
        f = urllib2.urlopen(req, timeout=2.0)
    except Exception as e:
        # This is likely a 429 from reddit. Should update the cached file.
        os.utime(JSON_FILE, None)
        print e
        return get_cached_json()

    buf = f.read()
    try:
        obj = json.loads(buf)
    except:
        print buf.encode('base64')
        return None
    f.close()

    if 'error' in obj:
        # load from file cache
        print 'Freakin reddit...'
        return get_cached_json()
    else:
        # save to file cache
        f = open(JSON_FILE, 'w')
        f.write(buf)
        f.close()

    return obj

def update_url(url):
    url = url.replace('wezuzoho', 'torijef') # fix Blazers
    url = url.replace('joviqivido', 'zanutiy') # fix Standard Sort
    return url

def show_url(url):
    url = update_url(url)
    if url.startswith('https://output.jsbin.com'):
        url = url.replace('//output.', '//')

    if url.startswith('http://jsbin.com/'):
        if '/edit' in url:
            url = url[0:url.index('/edit')]
        if url.endswith('/show'):
            url = url[0:url.rindex('/show')]

        if not(url.endswith('/')):
            url += '/'
        return url + 'embed?output'
    elif (url.startswith('http://fiddle.jshell.net/') or url.startswith('http://jsfiddle.net/')) and not((url.endswith('/show/') or url.endswith('/show'))):
        return url + '/show/'
    else:
        return url

def code_url(url):
    url = update_url(url)
    if url.startswith('http://output.jsbin.com'):
        url = url.replace('//output.', '//')

    if url.startswith('http://jsbin.com/') and not(url.endswith('/edit')):
        return url.rstrip('/') + '/edit'
    elif (url.startswith('http://fiddle.jshell.net/') or url.startswith('http://jsfiddle.net/')) and (url.endswith('/show') or url.endswith('/show/')):
        return url.replace('/show', '')
    else:
        return url

@route('/gallery/preview/<hash>')
def code(hash):
    cache_fn = "cache/" + hash
    if os.path.isfile(cache_fn):
        with open(cache_fn, 'r') as f:
            buf = f.read()
        return '<html><script src="https://code.jquery.com/jquery-latest.js"></script><script src="https://blinken.org/client.js"></script></head><body><script>' + buf + '</script></body></html>'

# will call urllib2.urlopen/read 
def js_code(url):
    cache_fn = "cache/" + hashlib.sha256(url).hexdigest()
    if os.path.isfile(cache_fn):
        f = open(cache_fn, 'r')
        buf = f.read()
        f.close()
        return buf        

    if url.startswith('http://output.jsbin.com'):
        url = url.replace('//output.', '//')

    # http://jsbin.com/oWOfadIM/73/edit?html,js,output -> http://jsbin.com/oWOfadIM/73/js
    if url.startswith('http://jsbin.com/'):
        url = url.replace('http://', 'https://')
        if '/show' in url or '/edit' in url or '/embed' in url:
            js_url = url[0:url.rindex('/')] + '/js'
        else:
            if url.endswith('/'):
                js_url = url + 'js'
            else:
                js_url = url + '/js'

        print 'js_url: ' + js_url
        try:
            req = urllib2.Request(js_url, None, { 'User-Agent' : 'Mozilla/5.0' })
            resp = urllib2.urlopen(req)
        except Exception as e:
            print e
            return None
        buf = resp.read()

    elif (url.startswith('http://fiddle.jshell.net/') or url.startswith('http://jsfiddle.net/')):
        path = url[8:].split('/')
        if len(path) < 2:
            return None
        js_url = 'http://jsfiddle.net/%s/embedded/js/' % (path[2])
        try:
            resp = urllib2.urlopen(js_url, timeout=5.0)
        except Exception as e:
            print e
            return None
        js_page = resp.read()
        js_start_tag = '<pre class="tCont active">'
        js_start = js_page.index(js_start_tag)
        js_end = js_page.index('</pre>', js_start)

        h = HTMLParser.HTMLParser()
        buf = h.unescape(js_page[js_start+len(js_start_tag):js_end])
         
    else:
        resp = urllib2.urlopen(url)
        buf = resp.read()
    
    f = open(cache_fn, 'w')
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

    obj = get_bbbblinken_json()

    idx = -1
    hit_index = False
    more_pages = False
    items = []
    h = HTMLParser.HTMLParser()
    print len(obj['data']['children'])
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
        c['preview_hash'] = hashlib.sha256(url).hexdigest()
        c['title'] = h.unescape(c['title'])
        js_code(url) # warm up cache
        items += [c]

    return template('index', items=items, page=page, more_pages=more_pages)

@route('/api/0/random')
def getrandom():
    print 'getrandom req...'
    obj = get_bbbblinken_json()

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
    print url

    response.set_header('Content-Type', 'application/javascript')
    
    output = {}
    output['code'] = js_code(url)
    output['url'] = url
    output['name'] = winner['title']
    return json.dumps(output)

run(host='localhost', port=3001)
