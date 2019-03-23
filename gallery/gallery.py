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
        f = urllib2.urlopen("https://www.reddit.com/r/bbbblinken.json", timeout=2.0)
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

# show url
def show_url(url):

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

    if url.startswith('http://output.jsbin.com'):
        url = url.replace('//output.', '//')

    if url.startswith('http://jsbin.com/') and not(url.endswith('/edit')):
        return url.rstrip('/') + '/edit'
    elif (url.startswith('http://fiddle.jshell.net/') or url.startswith('http://jsfiddle.net/')) and (url.endswith('/show') or url.endswith('/show/')):
        return url.replace('/show', '')
    else:
        return url

# will call urllib2.urlopen/read 
def js_code(url):

    cache_fn = "cache/" + hashlib.md5(url).hexdigest()
    if os.path.isfile(cache_fn):
        f = open(cache_fn, 'r')
        buf = f.read()
        f.close()
        return buf        

    if url.startswith('http://output.jsbin.com'):
        url = url.replace('//output.', '//')

    # http://jsbin.com/oWOfadIM/73/edit?html,js,output -> http://jsbin.com/oWOfadIM/73/js
    if url.startswith('http://jsbin.com/'):
        if '/show' in url or '/edit' in url or '/embed' in url:
            js_url = url[0:url.rindex('/')] + '/js'
        else:
            if url.endswith('/'):
                js_url = url + 'js'
            else:
                js_url = url + '/js'

        print 'js_url: ' + js_url
        try:
            #resp = urllib2.urlopen(js_url, timeout=2.0)
            headers = { 'User-Agent' : 'Mozilla/5.0' }
            req = urllib2.Request(js_url, None, headers)
            resp = urllib2.urlopen(req)
        except Exception as e:
            print e
            return None
        buf = resp.read()

    elif (url.startswith('http://fiddle.jshell.net/') or url.startswith('http://jsfiddle.net/')):
        if url.endswith('/show'):
            url = url[0:url.rindex('/show')]
        js_url = code_url(url) + '/embedded/js/'
        # This url still has a bunch of crap in it...
        print 'js_url: ' + js_url
        try:
            resp = urllib2.urlopen(js_url, timeout=2.0)
        except Exception as e:
            print e
            return None
        js_page = resp.read()
        js_start_tag = '<pre data-language="js" class="js tCont  active">'
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


@route('/')
@route('/<page_s>')
def index(page_s='0'):
    page = int(page_s)

    obj = get_bbbblinken_json()

    idx = -1
    hit_index = False
    more_pages = False
    items = []
    print len(obj['data']['children'])
    for child in obj['data']['children']:
        c = child['data']
        if c['is_self']:
            continue
        url = show_url(c['url'])
        idx += 1
        if not(idx in range(page*PER_PAGE, (page+1)*PER_PAGE)):
            if hit_index:
                more_pages = True
            continue
        hit_index = True
        c['code_url'] = code_url(c['url'])
        c['show_url'] = url.replace("http://", "https://")
        items += [c]

    return template('index', items=items, page=page, more_pages=more_pages)


@route('/random')
@route('/random/')
def getrandom():
    print 'getrandom req...'
    obj = get_bbbblinken_json()
    print 'got object'

    candidates = []
    for child in obj['data']['children']:
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
