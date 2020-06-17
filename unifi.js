module.exports = function (RED) {

  'use strict';

  const STATUS_OK = {
      fill: "green",
      shape: "dot",
      text: "OK"
  };

  const Unifi = require('ubnt-unifi');

  function UnifiEventsNode(config) {
      RED.nodes.createNode(this, config);
      const node = this;
      const {username, password} = node.credentials;
      let {site, host, port, insecure, unifios} = config;

      let clientMap = {};

      // console.log("Connecting to", host);

      this.status({fill:"grey",shape:"dot",text:"connecting"});

      let unifi = new Unifi({
        host: host,
        port: port,
        username: username,
        password: password,
        site: site,
        insecure: insecure,
        unifios: unifios
      });
      
      unifi.on('ctrl.connect', function (data) {
        node.status({fill:"green",shape:"dot",text:"connected"});
        unifi.get('stat/alluser')
          .then(sta => {
            // console.log('Loaded info for '+sta.data.length+' users');
            sta.data.forEach((el, index) => clientMap[el.mac] = el);
            console.log(sta.data.map((el) => el.mac + " " + (el.name || el.hostname || el.device_name)));
          });
      });

      unifi.on('ctrl.error', function (data) {
        node.status({fill:"red",shape:"dot",text:"error"});
      });

      unifi.on('ctrl.disconnect', function (data) {
        node.status({fill:"grey",shape:"ring",text:"disconnected"});
      });

      unifi.on('ctrl.reconnect', function (data) {
        node.status({fill:"grey",shape:"dot",text:"reconnecting"});
      });

      unifi.on('ctrl.close', function (data) {
        node.status({fill:"grey",shape:"dot",text:"disconnected"});
      });
      
      // Listen for any event
      unifi.on('**', function (data) {
        console.log("Received event", this.event, data);

        let msg = {
          payload: {
            namespace: this.event.split('.')[0],
            event: this.event,
            data: data
          }
        };

        if (data && data.user) {          
          // details are cached. enrich event
          let client = clientMap[data.user];
          if (client) {
            addClientToPayload(client, msg.payload);
            node.send(msg);
          } else {
            // load client details
            // console.log('Loading info for '+data.user);
            unifi.get('stat/user/'+data.user)
              .then(response => {
                // console.log('Got user info', response);
                client = response.data[0];
                clientMap[data.user] = client;
                addClientToPayload(client, msg.payload);
                node.send(msg);
              });
          }
        } else {
          node.send(msg);
        }
      });

      function addClientToPayload(client, payload) {
        payload.client = {
          hostname: client.hostname,
          device_name: client.device_name,
          name: client.name,
          ip: client.ip
        };
      }

      this.on('close', function() {
        node.status({fill:"grey",shape:"dot",text:"disconnecting"});
        // console.log("Closing connection");
        unifi.close();
      });
  }

  RED.nodes.registerType("UnifiEvents", UnifiEventsNode, {
      credentials: {
          username: {type: "text"},
          password: {type: "password"}
      }
  });
};