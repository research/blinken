#!/usr/bin/python

import wemo
import socket
import sys
import time

PI_ADDR = '141.212.108.209'
PI_PORT = 22

s = None

for retries in range(3):

    try:
        s = socket.create_connection((PI_ADDR, PI_PORT), 10.0)
    except socket.timeout:
        # connection timeout, wait 5 seconds, try again
        print 'Connect timeout %d...' % (retries+1)
        time.sleep(5)
        continue

    print 'Connect success, quitting'
    # Sucess, no need to reboot everything
    sys.exit(0)
    
print 'Going to reboot pi...'
w = wemo.WemoSwitch(wemo.WEMO_1_HOST, wemo.WEMO_1_PORT)


def get_wemo_state(w):
    state = 'off'
    if w.getPowerState():
        state = 'on'
    return state

print 'Current wemo state: %s' % (get_wemo_state(w))

print 'Shutting down wemo, sleeping 15 seconds'
w.setOff()
print 'Current wemo state: %s' % (get_wemo_state(w))
time.sleep(15)

print 'Turning on wemo'
w.setOn()
print 'Current wemo state: %s' % (get_wemo_state(w))
time.sleep(10)

