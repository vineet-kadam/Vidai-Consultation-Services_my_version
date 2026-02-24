from .models import *
from datetime import datetime
from typing import Dict, Any
import threading

# Thread-safe lock for socket registry
_socket_registry_lock = threading.Lock()

# In-memory registry of active socket connections
# Format: { socket_id: { url, type, connected, created_at, last_updated, user_info } }
_socket_registry: Dict[str, Dict[str, Any]] = {}


class SocketStatusService:
    """
    Service to track and manage WebSocket status information.
    Provides non-intrusive monitoring of socket connections without affecting existing functionality.
    """

    @staticmethod
    def register_socket(socket_id: str, socket_type: str, user_info: Dict[str, Any] = None) -> None:
        """
        Register a new socket connection.
        
        Args:
            socket_id: Unique identifier for the socket
            socket_type: Type of socket (e.g., 'call', 'stt', 'stt_room', 'stt_sales', 'stt_admin')
            user_info: Optional user information (role, name, etc.)
        """
        with _socket_registry_lock:
            _socket_registry[socket_id] = {
                'id': socket_id,
                'type': socket_type,
                'connected': True,
                'created_at': datetime.now().isoformat(),
                'last_updated': datetime.now().isoformat(),
                'user_info': user_info or {}
            }

    @staticmethod
    def unregister_socket(socket_id: str) -> None:
        """Mark socket as disconnected and remove from registry."""
        with _socket_registry_lock:
            if socket_id in _socket_registry:
                del _socket_registry[socket_id]

    @staticmethod
    def update_socket(socket_id: str, **kwargs) -> None:
        """Update socket information."""
        with _socket_registry_lock:
            if socket_id in _socket_registry:
                _socket_registry[socket_id]['last_updated'] = datetime.now().isoformat()
                _socket_registry[socket_id].update(kwargs)

    @staticmethod
    def get_socket_status(socket_id: str) -> Dict[str, Any] or None:
        """Get status of a specific socket."""
        with _socket_registry_lock:
            return _socket_registry.get(socket_id)

    @staticmethod
    def get_all_sockets() -> Dict[str, Dict[str, Any]]:
        """Get status of all active sockets."""
        with _socket_registry_lock:
            return dict(_socket_registry)

    @staticmethod
    def get_sockets_by_type(socket_type: str) -> Dict[str, Dict[str, Any]]:
        """Get all sockets of a specific type."""
        with _socket_registry_lock:
            return {
                sid: info for sid, info in _socket_registry.items()
                if info['type'] == socket_type
            }

    @staticmethod
    def get_socket_count() -> int:
        """Get count of active sockets."""
        with _socket_registry_lock:
            return len(_socket_registry)

    @staticmethod
    def get_socket_info_summary() -> Dict[str, Any]:
        """
        Get comprehensive WebSocket information summary.
        
        Returns:
            Dict with socket status info including active sockets, types, and WS URL
        """
        with _socket_registry_lock:
            sockets_by_type = {}
            for socket_info in _socket_registry.values():
                socket_type = socket_info['type']
                sockets_by_type[socket_type] = sockets_by_type.get(socket_type, 0) + 1

            return {
                'active': len(_socket_registry) > 0,
                'total_sockets': len(_socket_registry),
                'sockets_by_type': sockets_by_type,
                'timestamp': datetime.now().isoformat(),
                'ws_endpoints': {
                    'call': '/ws/call/<room>/',
                    'stt': '/ws/stt/',
                    'stt_room': '/ws/stt/room/?role=<role>&name=<name>',
                    'stt_sales': '/ws/stt/sales/',
                    'stt_admin': '/ws/stt/admin/',
                }
            }


def create_doctor(doctor_data):
    username = doctor_data["first_name"].lower().strip() + "_" + doctor_data["last_name"].lower().strip()
    doctor_available  = User.objects.filter(username=username).first()
    if doctor_available:
        return doctor_available
    doctor_user = create_user({
        "username"   : username,
        "password"   : username,
        "first_name": doctor_data["first_name"],
        "last_name" : doctor_data["last_name"],
        "role"      : "doctor",
    })
    return doctor_user

def create_patient(patient_data):
    username = patient_data["username"]
    patient_available  = User.objects.filter(username=username).first()
    if patient_available:
        return patient_available
    patient_user = create_user({
        "username"   : username,
        "password"   : username,
        "first_name": patient_data["first_name"],
        "last_name" : patient_data["last_name"],
        "role"      : "patient",
    })
    return patient_user

def create_user(user_data):
    user = User.objects.create_user(
        username=user_data["username"],
        password=user_data["password"],
        first_name=user_data["first_name"],
        last_name=user_data["last_name"],
    )
    
    # Create the associated UserProfile with the role
    role = user_data.get("role", "patient").lower()
    UserProfile.objects.create(user=user, role=role)
    
    return user

