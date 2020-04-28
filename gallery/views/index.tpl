<html lang="en">
<head> 
  <link href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/2.3.2/css/bootstrap.min.css" rel="stylesheet"/>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/2.3.2/css/bootstrap-responsive.min.css" rel="stylesheet"/>
  <link href="/css/local.css" rel="stylesheet"/>
  <title>BBB Blinken Bulbs - Gallery</title>
  <meta name="viewport" content="width=device-width, initial-scale=0.85">
  <style>
iframe.preview {
    height: 500px;
    width: 100%;
    background: #f8f8f8;
    border: 0;
    margin-top: 5px;
    border-top: 1px solid #ccc;
}

iframe.reddit {
    height: 30px;
    border: none;
    top: 0px;
    width: 100%;
    background: #f8f8f8;
    border: 0;
}

.blinken {
    border: 1px solid #ccc;
    background: #f8f8f8;
    width: 290px;
    display: inline;
    float: left;
    margin: 5px;
}
.blinken h4 {
    width: 290px;
    height: 45px;
    font-size: 16pt;
}

.blinken a {
    text-decoration: none;
}

.blinken a:hover {
    text-decoration: underline;
}

.navlink {
  width:100%;
  text-align: center;
}

.blinken center {
    width: 290px;
}

.clearfix {
    clear: both;
}

  </style>
</head>
<body style="background-color: #f5f5f5">
  <div class="navbar navbar-static-top navbar-inverse">
    <div class="navbar-inner">
    <a class="brand" href="/">BBB Blinken Bulbs</a>
       <ul class="nav pull-right">
          <li><a href="/status/">Status</a></li>
          <li><a href="/gallery/">Gallery</a></li>
          <li><a href="https://jsbin.com/libimax/edit#javascript,console,output">Example</a></li>
          <li><a href="https://www.reddit.com/r/bbbblinken">Subreddit</a></li>
       </ul>
    </div>
  </div>
  <div class="content">
    <div class="container">
        <div class="row-fluid"> 
          <div class="span10 white-panel offset1 title">
            <div class="content">
            <h2>BBB Blinken Bulbs Gallery</h2>

<div class="navlink">
%if page != 0:
<a class="prev_link" href="/gallery/{{page-1}}">&lt;&lt; Previous</a>
%end
%if more_pages:
<a class="next_link" href="/gallery/{{page+1}}">Next &gt;&gt;</a>
%end
</div>
</div>

<div class="content">
%for item in items:
<div class="blinken">
<center>
 <div>
   <span>
     <iframe class="reddit" src="https://www.reddit.com/static/button/button1.html?width=120&url=https://reddit.com{{item['permalink']}}&newwindow=1"></iframe>
   </span>
   <div>
     <h4><a href="https://www.reddit.com{{item['permalink']}}">{{item['title']}}</a></h4>
     (<a href="https://www.reddit.com{{item['permalink']}}">comments</a>) (<a href="{{item['code_url']}}">code</a>)
   </div>
 </div>
 <iframe class="preview" sandbox="allow-scripts allow-same-origin" src="/gallery/preview/{{item['preview_hash']}}"></iframe>
</center></div>
%end

<div class="clearfix"></div><br/></div>

<div class="navlink">
%if page != 0:
<a class="prev_link" href="/gallery/{{page-1}}">&lt;&lt; Previous</a>
%end
%if more_pages:
<a class="next_link" href="/gallery/{{page+1}}">Next &gt;&gt;</a>
%end
</div><br/>
           </div>
         </div>
       </div>
    </div>
  </div>
</body>
</html>
