#!/usr/bin/env python
from bottle import route, run, template
import json
import urllib


def get_bbbblinken_json():
    f = urllib.urlopen("http://reddit.com/r/bbbblinken.json")
    buf = f.read()
    try:
        obj = json.loads(buf)
    except:
        print buf.encode('base64')
    f.close()

    if 'error' in obj:
        # load from file cache
        print 'Freakin reddit...'
        f = open('/tmp/bbbblinken.json.last', 'r')
        obj = json.loads(f.read())    
        f.close()
    else:
        # save to file cache
        f = open('/tmp/bbbblinken.json.last', 'w')
        f.write(buf)
        f.close()

    return obj

# show url
def show_url(url):
    if url.startswith('http://jsbin.com/') and '/edit' in url:
        return url[0:url.index('/edit')]
    elif (url.startswith('http://fiddle.jshell.net/') or url.startswith('http://jsfiddle.net/')) and not(url.endswith('/show/')):
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

run(host='localhost', port=8080)
