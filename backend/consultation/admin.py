from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import UserProfile, Clinic, DoctorAvailability, Meeting

# =============================================================================
# 1. USER PROFILE EXTENSION
# =============================================================================

class UserProfileInline(admin.StackedInline):
    """
    Allows editing UserProfile data (Role, Clinic, etc.) directly inside the 
    standard Django User admin page.
    """
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'User Profile'
    fk_name = 'user'

class UserAdmin(BaseUserAdmin):
    """
    Re-register the User admin to include the profile inline.
    """
    inlines = (UserProfileInline,)
    list_display = ('username', 'email', 'first_name', 'last_name', 'get_role', 'is_staff')
    
    def get_role(self, obj):
        # Safe access in case profile doesn't exist for some legacy users
        return obj.profile.role if hasattr(obj, 'profile') else '-'
    get_role.short_description = 'Role'

# Unregister the default User admin and register our customized version
admin.site.unregister(User)
admin.site.register(User, UserAdmin)

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    """
    Standalone view for UserProfiles if needed.
    """
    list_display = ('user', 'role', 'clinic', 'mobile', 'sex')
    list_filter = ('role', 'sex', 'clinic')
    search_fields = ('user__username', 'user__email', 'mobile')
    autocomplete_fields = ['user', 'clinic']


# =============================================================================
# 2. CLINIC & AVAILABILITY
# =============================================================================

class DoctorAvailabilityInline(admin.TabularInline):
    """
    Shows doctor schedules directly inside the Clinic admin page.
    """
    model = DoctorAvailability
    extra = 1
    autocomplete_fields = ['doctor']

@admin.register(Clinic)
class ClinicAdmin(admin.ModelAdmin):
    list_display = ('name', 'clinic_id', 'member_count')
    search_fields = ('name', 'clinic_id')
    inlines = [DoctorAvailabilityInline]

    def member_count(self, obj):
        return obj.members.count()
    member_count.short_description = 'Total Members'

@admin.register(DoctorAvailability)
class DoctorAvailabilityAdmin(admin.ModelAdmin):
    list_display = ('doctor', 'clinic', 'day_name', 'start_time', 'end_time')
    list_filter = ('day_of_week', 'clinic')
    search_fields = ('doctor__username', 'doctor__first_name', 'clinic__name')
    autocomplete_fields = ['doctor', 'clinic']

    def day_name(self, obj):
        return obj.get_day_of_week_display()
    day_name.short_description = 'Day'


# =============================================================================
# 3. MEETING MANAGEMENT
# =============================================================================

@admin.register(Meeting)
class MeetingAdmin(admin.ModelAdmin):
    list_display = (
        'meeting_id', 
        'scheduled_time',
        'get_patient', 
        'get_doctor', 
        'appointment_type', 
        'status'
    )
    list_filter = (
        'status', 
        'meeting_type', 
        'appointment_type', 
        'clinic', 
        'scheduled_time'
    )
    search_fields = (
        'room_id', 
        'patient__username', 'patient__email', 'patient__first_name',
        'doctor__username', 'doctor__first_name',
        'appointment_reason'
    )
    readonly_fields = ('room_id', 'created_at', 'updated_at')
    autocomplete_fields = ['patient', 'doctor', 'sales', 'clinic']

    # Organize the form into logical sections
    fieldsets = (
        ('Identifiers', {
            'fields': ('room_id', 'clinic')
        }),
        ('Participants', {
            'fields': ('patient', 'doctor', 'sales', 'participants')
        }),
        ('Schedule', {
            'fields': ('scheduled_time', 'duration', 'status', 'meeting_type', 'appointment_type')
        }),
        ('Medical Context', {
            'fields': ('appointment_reason', 'department', 'remark', 'speech_to_text'),
            'classes': ('collapse',)  # Makes this section collapsible
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at')
        }),
    )

    # Custom methods for List Display
    def get_patient(self, obj):
        return obj.patient.get_full_name() if obj.patient else "-"
    get_patient.short_description = 'Patient'

    def get_doctor(self, obj):
        return obj.doctor.get_full_name() if obj.doctor else "-"
    get_doctor.short_description = 'Doctor'

    # --- Custom Actions ---

    @admin.action(description='Mark selected meetings as Cancelled')
    def mark_cancelled(self, request, queryset):
        updated = queryset.update(status='cancelled')
        self.message_user(request, f"{updated} meeting(s) marked as Cancelled.")

    @admin.action(description='Mark selected meetings as Ended')
    def mark_ended(self, request, queryset):
        updated = queryset.update(status='ended')
        self.message_user(request, f"{updated} meeting(s) marked as Ended.")

    actions = [mark_cancelled, mark_ended]