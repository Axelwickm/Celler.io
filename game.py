#!/usr/bin/python
import json, sys
from time import sleep

def jprint(s):
    print(json.dumps({'event':'print','data':s}));
    sys.stdout.flush()
    
def onfullupdate(data):
    pass

def onpartialupdate(data):
    pass


jprint('testlog');
while 1:
    for line in sys.stdin:
        parsed = json.loads(line);
        if parsed.event == 'onfullupdate':
            onfullupdate(parsed.data)
        elif parsed.event == 'onpartialupdate':
            onpartialupdate(parsed.data)
        else:
            jprint('unhandled data')