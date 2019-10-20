BBB Blinkenlights
=================

Software that operates the Bob & Better Beyster Building Blinkenlights.

For more information, see the [Documentation](https://docs.google.com/document/d/1kO2LvbGgDD-2SHmxqKJG2VrXhhx4hQG96N9LBkynDJc/edit) on Google Docs.

## Running in Production

The services should be installed through systemd and set to run on boot. To restart them:

    systemctl restart gallery
    systemctl restart blinken

To view logs, use:

   journalctl

## Running the Services Manually

To run the server for testing, you can do:

    cd blinken/gallery && nohup ./gallery.py &
    cd blinken/server && nohup ./server.js &
