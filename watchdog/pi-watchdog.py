#!/usr/bin/python

import wemo
import socket
import sys
import time

PI_ADDR = '141.212.108.209'
PI_PORT = 22

s = None

def cur_time():
    return time.strftime("%Y %b %d %T", time.gmtime())

for retries in range(3):

    try:
        s = socket.create_connection((PI_ADDR, PI_PORT), 10.0)
    except socket.timeout:
        # connection timeout, wait 5 seconds, try again
        print '[%s] Connect timeout %d...' % (cur_time(), retries+1)
        time.sleep(5)
        continue

    print '[%s] Connect success, quitting' % (cur_time())
    # Sucess, no need to reboot everything
    sys.exit(0)
    
print '[%s] Going to reboot pi...' % (cur_time())
w = wemo.WemoSwitch(wemo.WEMO_1_HOST, wemo.WEMO_1_PORT)


def get_wemo_state(w):
    state = 'off'
    if w.getPowerState():
        state = 'on'
    return state

print '[%s] Current wemo state: %s' % (cur_time(), get_wemo_state(w))

print '[%s] Shutting down wemo, sleeping 15 seconds' % (cur_time())
w.setOff()
print '[%s] Current wemo state: %s' % (cur_time(), get_wemo_state(w))
time.sleep(15)

print '[%s] Turning on wemo' % (cur_time())
w.setOn()
print '[%s] Current wemo state: %s' % (cur_time(), get_wemo_state(w))
time.sleep(10)

