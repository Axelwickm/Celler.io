#!/usr/bin/python
import json, sys
from time import sleep

def jprint(s):
	print(json.dumps({'event':'print','data':s}));
	sys.stdout.flush()


jprint('testlog');
while 1:
	for line in sys.stdin:
		jprint('gotdata')