#!/usr/bin/env python
from bottle import route, run, template, response
import json
import urllib
import urllib2
import random
import HTMLParser
import os
import time
import hashlib

JSON_FILE = '/tmp/bbbblinken.json.last'

def get_cached_json():
    f = open(JSON_FILE, 'r')
    obj = json.loads(f.read())    
    f.close()
    return obj
 

def get_bbbblinken_json():

    diff = time.time() - os.path.getmtime(JSON_FILE)
    print '%s seconds since last...' % (str(diff))
    if (diff < 60):
        return get_cached_json()

    try:
        f = urllib2.urlopen("http://www.reddit.com/r/bbbblinken.json", timeout=2.0)
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
    if url.startswith('http://jsbin.com/') and '/edit' in url:
        return url[0:url.index('/edit')]
    elif url.startswith('http://jsbin.com/') and url.endswith('/show'):
        return url[0:url.rindex('/show')]
    elif (url.startswith('http://fiddle.jshell.net/') or url.startswith('http://jsfiddle.net/')) and not((url.endswith('/show/') or url.endswith('/show'))):
        return url + '/show/'
    else:
        return url

def code_url(url):
    if url.startswith('http://jsbin.com/') and not(url.endswith('/edit')):
        return url + '/edit'
    elif (url.startswith('http://fiddle.jshell.net/') or url.startswith('http://jsfiddle.net/')) and (url.endswith('/show') or url.endswith('/show/')):
        return url.replace('/show', '')
    else:
        return url

# will call urllib2.urlopen/read 
def js_code(url):

    cache_fn = hashlib.md5(url).hexdigest()
    if os.path.isfile(cache_fn):
        f = open(cache_fn, 'r')
        buf = f.read()
        f.close()
        return buf        

    # http://jsbin.com/oWOfadIM/73/edit?html,js,output -> http://jsbin.com/oWOfadIM/73/js
    if url.startswith('http://jsbin.com/'):
        if '/show' in url or '/edit' in url:
            js_url = url[0:url.rindex('/')] + '/js'
        else:
            if url.endswith('/'):
                js_url = url + 'js'
            else:
                js_url = url + '/js'

        print 'js_url: ' + js_url
        try:
            resp = urllib2.urlopen(js_url, timeout=2.0)
        except Exception as e:
            print e
            return None
        buf = resp.read()

    elif (url.startswith('http://fiddle.jshell.net/') or url.startswith('http://jsfiddle.net/')):
        if url.endswith('/show'):
            url = url[0:url.rindex('/show')]
        js_url = code_url(url) + 'embedded/js/'
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


@route('/gallery')
@route('/gallery/')
def index():

    buf = '''<html>
<head>
<style>
iframe {
    height: 500px;
    width: 250px;
    border: none;
}

iframe.reddit {
    height: 20px;
    border: none;
}

.blinken {
    border: 1px solid #ccc;
    width: 300px;
    display: inline;
    float: left;
    margin-left: 10px;
}
.blinken h1 {
    width: 300px;
    height: 45px;
    font-size: 16pt;
}

.blinken a {
    text-decoration: none;
}

.blinken a:hover {
    text-decoration: underline;
}


.blinken center {
    width: 300px;
}
</style>
</head>
<body>
<h1>BBBBlinken</h1>'''
    #return str(obj)
    obj = get_bbbblinken_json()

    for child in obj['data']['children']:
        c = child['data']
        if c['is_self']:
            continue
        url = show_url(c['url'])
        buf += '''<div class="blinken">
<center>
 <div>
   <span>
     <iframe class="reddit" src="http://www.reddit.com/static/button/button1.html?width=120&url=%s&newwindow=1"></iframe>
   </span>
   <span>
     <h1><a href="http://www.reddit.com%s">%s</a></h1>
     (<a href="http://www.reddit.com%s">comments</a>) (<a href="%s">code</a>)
   </span>
 </div>
 <iframe src="%s"></iframe>
</center></div>\n''' % \
            (c['url'], c['permalink'], c['title'], c['permalink'], code_url(c['url']), url)

    return buf + '''</body>
</html>'''
    #return template('<b>Hello {{name}}</b>!', name=name)


@route('/gallery/random')
@route('/gallery/random/')
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
        #urls.append(show_url(c['url']))
 
    winner = random.choice(candidates)
    url = show_url(winner['url'])
    print url

    response.set_header('Content-Type', 'application/javascript')
    
    output = {}
    output['code'] = js_code(url)
    output['url'] = url
    output['name'] = winner['title']
    return json.dumps(output)

    #return 'This is going to be random'



run(host='localhost', port=8080)
