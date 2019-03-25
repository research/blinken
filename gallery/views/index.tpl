<html lang="en">
<head> 
  <link href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/2.3.2/css/bootstrap.min.css" rel="stylesheet"/>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/2.3.2/css/bootstrap-responsive.min.css" rel="stylesheet"/>
  <link href="/css/local.css" rel="stylesheet"/>
  <title>BBB Blinken Bulbs - Gallery</title>
  <style>
iframe {
    height: 500px;
    width: 250px;
    border: none;
    position: relative;
    top: -34px;
}

.clearfix {
    clear: both;
}

iframe.reddit {
    height: 30px;
    width: 120px;
    border: none;
    top: 0px;
}

.blinken {
    border: 1px solid #ccc;
    width: 290px;
    display: inline;
    float: left;
    margin-left: 10px;
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
  </style>
</head>
<body style="background-color: #f5f5f5">
  <div class="navbar navbar-static-top navbar-inverse">
    <div class="navbar-inner">
    <a class="brand" href="/">BBB Blinken Bulbs</a>
       <ul class="nav pull-right">
          <li><a href="/status">Status</a></li>
          <li><a href="/gallery">Gallery</a></li>
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
     <iframe class="reddit" src="https://www.reddit.com/static/button/button1.html?width=120&url={{item['url']}}&newwindow=1"></iframe>
   </span>
   <span>
     <h4><a href="https://www.reddit.com{{item['permalink']}}">{{item['title']}}</a></h4>
     (<a href="https://www.reddit.com{{item['permalink']}}">comments</a>) (<a href="{{item['code_url']}}">code</a>)
   </span>
 </div>
 <div style="width: 250px; height: 500px; overflow: hidden;">
 <iframe src="{{item['show_url']}}"></iframe>
 </div>
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
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/2.2.4/jquery.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/2.3.2/js/bootstrap.min.js"></script>
</body>
</html>
