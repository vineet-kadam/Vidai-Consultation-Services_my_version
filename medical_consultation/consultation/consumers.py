from channels.generic.websocket import AsyncWebsocketConsumer
import json

class CallConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room"]
        self.room_group_name = f"call_{self.room_name}"

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        # We broadcast the data as the 'payload'
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "signal_message",
                "payload": data,
                "sender": self.channel_name,
            }
        )

    async def signal_message(self, event):
        # Do not send back to the person who sent it
        if self.channel_name == event["sender"]:
            return

        # Send the actual payload to the frontend
        await self.send(text_data=json.dumps(event["payload"]))