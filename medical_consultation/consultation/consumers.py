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
        print(f"✅ User connected to room: {self.room_name}")

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        print(f"❌ User disconnected from room: {self.room_name}")

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get("type", "unknown")
        
        print(f"📩 Received {msg_type} from {self.channel_name}")
        
        # Broadcast the data as the 'payload' with sender info
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
            print(f"🔇 Not echoing message back to sender")
            return

        # Send the actual payload to the frontend
        print(f"📤 Forwarding {event['payload'].get('type', 'unknown')} to {self.channel_name}")
        await self.send(text_data=json.dumps(event["payload"]))