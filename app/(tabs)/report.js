import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Image, Modal } from 'react-native';
import { Camera, MapPin, Upload, Send, X, Navigation, Map } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { createIssue, getCurrentUser, updateUserPoints, getStates, getDistrictsByState, getAreasByDistrict } from '../../lib/supabase';
import { uploadMultipleImages } from '../../lib/cloudinary';
import { useTranslation } from 'react-i18next';

export default function ReportScreen() {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category: '',
        locationName: '',
        address: '',
        area: '',
        ward: '',
        priority: 'medium',
        latitude: null,
        longitude: null,
        selectedState: '',
        selectedDistrict: '',
        selectedArea: '',
        locationType: 'manual', // 'manual' or 'current'
    });
    const [selectedImages, setSelectedImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [states, setStates] = useState([]);
    const [districts, setDistricts] = useState([]);
    const [areas, setAreas] = useState([]);
    const [loadingLocations, setLoadingLocations] = useState(false);

    const categories = [
        { id: 'roads', label: 'Roads & Infrastructure', color: '#EF4444', icon: '🛣️' },
        { id: 'utilities', label: 'Utilities', color: '#F59E0B', icon: '⚡' },
        { id: 'environment', label: 'Environment', color: '#10B981', icon: '🌱' },
        { id: 'safety', label: 'Safety & Security', color: '#8B5CF6', icon: '🚨' },
        { id: 'parks', label: 'Parks & Recreation', color: '#06B6D4', icon: '🌳' },
        { id: 'other', label: 'Other', color: '#6B7280', icon: '📋' },
    ];

    const priorities = [
        { id: 'low', label: 'Low Priority', color: '#10B981', description: 'Can wait for scheduled maintenance' },
        { id: 'medium', label: 'Medium Priority', color: '#F59E0B', description: 'Should be addressed soon' },
        { id: 'high', label: 'High Priority', color: '#EF4444', description: 'Needs immediate attention' },
        { id: 'urgent', label: 'Urgent', color: '#DC2626', description: 'Emergency - immediate action required' },
    ];

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled) {
            setSelectedImages([...selectedImages, ...result.assets]);
        }
    };

    const takePhoto = async () => {
        const result = await ImagePicker.launchCameraAsync({
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled) {
            setSelectedImages([...selectedImages, ...result.assets]);
        }
    };

    const removeImage = (index) => {
        setSelectedImages(selectedImages.filter((_, i) => i !== index));
    };

    const handleLocationSelection = () => {
        setShowLocationModal(true);
        loadStates();
    };

    const loadStates = async () => {
        try {
            setLoadingLocations(true);
            const { data, error } = await getStates();
            if (error) throw error;
            setStates(data || []);
        } catch (error) {
            console.error('Error loading states:', error);
        } finally {
            setLoadingLocations(false);
        }
    };

    const loadDistricts = async (stateId) => {
        try {
            setLoadingLocations(true);
            const { data, error } = await getDistrictsByState(stateId);
            if (error) throw error;
            setDistricts(data || []);
            setAreas([]);
        } catch (error) {
            console.error('Error loading districts:', error);
        } finally {
            setLoadingLocations(false);
        }
    };

    const loadAreas = async (districtId) => {
        try {
            setLoadingLocations(true);
            const { data, error } = await getAreasByDistrict(districtId);
            if (error) throw error;
            setAreas(data || []);
        } catch (error) {
            console.error('Error loading areas:', error);
        } finally {
            setLoadingLocations(false);
        }
    };

    const useCurrentLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Location permission is required to get current location');
                return;
            }

            const location = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = location.coords;

            // Reverse geocoding to get address
            const reverseGeocode = await Location.reverseGeocodeAsync({
                latitude,
                longitude,
            });

            if (reverseGeocode.length > 0) {
                const address = reverseGeocode[0];
                setFormData({
                    ...formData,
                    latitude,
                    longitude,
                    locationName: `${address.street || ''} ${address.name || ''}`.trim(),
                    address: `${address.street || ''}, ${address.city || ''}, ${address.region || ''}`,
                    area: address.district || address.subregion || '',
                    ward: address.city || '',
                    locationType: 'current'
                });
                setShowLocationModal(false);
                Alert.alert(t('common.success'), 'Current location captured successfully!');
            }
        } catch (error) {
            console.error('Error getting location:', error);
            Alert.alert('Error', 'Failed to get current location');
        }
    };

    const confirmManualLocation = () => {
        if (!formData.selectedArea) {
            Alert.alert('Error', 'Please select an area');
            return;
        }

        // Find the selected area details
        const selectedAreaData = areas.find(a => a.id === formData.selectedArea);
        const selectedDistrictData = districts.find(d => d.id === formData.selectedDistrict);
        const selectedStateData = states.find(s => s.id === formData.selectedState);

        if (selectedAreaData && selectedDistrictData && selectedStateData) {
            setFormData({
                ...formData,
                locationName: selectedAreaData.name,
                address: `${selectedAreaData.name}, ${selectedDistrictData.name}, ${selectedStateData.name}`,
                area: selectedAreaData.name,
                ward: selectedDistrictData.name,
                locationType: 'manual'
            });
            setShowLocationModal(false);
            Alert.alert(t('common.success'), 'Location selected successfully!');
        }
    };

    const submitReport = async () => {
        if (!formData.title || !formData.description || !formData.category) {
            Alert.alert(t('common.error'), 'Please fill in all required fields');
            return;
        }

        if (!formData.locationName) {
            Alert.alert(t('common.error'), 'Please select or set a location for the issue');
            return;
        }

        try {
            setLoading(true);

            // Get current user
            const { user, error: userError } = await getCurrentUser();
            if (userError) throw userError;

            if (!user) {
                Alert.alert(t('common.error'), 'You must be logged in to report issues');
                return;
            }

            // Upload images to Cloudinary if any
            let imageUrls = [];
            if (selectedImages.length > 0) {
                const imageUris = selectedImages.map(img => img.uri);
                const uploadResult = await uploadMultipleImages(imageUris);

                if (uploadResult.error && uploadResult.successful.length === 0) {
                    Alert.alert(t('common.error'), 'Failed to upload images');
                    return;
                }

                imageUrls = uploadResult.successful.map(result => result.url);
            }

            // Create issue in Supabase
            const issueData = {
                user_id: user.id,
                title: formData.title,
                description: formData.description,
                category: formData.category,
                priority: formData.priority,
                location_name: formData.locationName,
                address: formData.address,
                area: formData.area,
                ward: formData.ward,
                latitude: formData.latitude,
                longitude: formData.longitude,
                images: imageUrls,
                status: 'pending',
                workflow_stage: 'reported',
                tags: [formData.category, formData.priority],
                metadata: {
                    source: 'mobile_app',
                    device_info: 'React Native',
                    submission_method: 'form',
                    location_type: formData.locationType
                }
            };

            const { data, error } = await createIssue(issueData);
            if (error) throw error;

            // Award points to user for reporting issue
            const pointsToAward = formData.priority === 'urgent' ? 20 :
                formData.priority === 'high' ? 15 :
                    formData.priority === 'medium' ? 10 : 5;

            await updateUserPoints(user.id, 'issue_reported', pointsToAward);

            Alert.alert(
                t('common.success'),
                `Your report has been submitted successfully! You earned ${pointsToAward} points. The issue will be automatically routed to the appropriate area administrator for review.`,
                [{
                    text: t('common.ok'),
                    onPress: () => {
                        setFormData({
                            title: '',
                            description: '',
                            category: '',
                            locationName: '',
                            address: '',
                            area: '',
                            ward: '',
                            priority: 'medium',
                            latitude: null,
                            longitude: null,
                            selectedState: '',
                            selectedDistrict: '',
                            selectedArea: '',
                            locationType: 'manual',
                        });
                        setSelectedImages([]);
                    }
                }]
            );
        } catch (error) {
            console.error('Error submitting report:', error);
            Alert.alert(t('common.error'), 'Failed to submit report: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Report an Issue</Text>
                <Text style={styles.subtitle}>Help improve your community by reporting civic issues</Text>
            </View>

            <View style={styles.form}>
                {/* Issue Title */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Issue Title *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Brief description of the issue"
                        value={formData.title}
                        onChangeText={(text) => setFormData({ ...formData, title: text })}
                    />
                </View>

                {/* Category Selection */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Category *</Text>
                    <View style={styles.categoryGrid}>
                        {categories.map((category) => (
                            <TouchableOpacity
                                key={category.id}
                                style={[
                                    styles.categoryButton,
                                    formData.category === category.id && styles.categoryButtonActive,
                                    { borderColor: category.color },
                                ]}
                                onPress={() => setFormData({ ...formData, category: category.id })}
                            >
                                <Text style={styles.categoryIcon}>{category.icon}</Text>
                                <Text
                                    style={[
                                        styles.categoryText,
                                        formData.category === category.id && { color: category.color },
                                    ]}
                                >
                                    {category.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Priority Level */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Priority Level</Text>
                    <View style={styles.priorityContainer}>
                        {priorities.map((priority) => (
                            <TouchableOpacity
                                key={priority.id}
                                style={[
                                    styles.priorityButton,
                                    formData.priority === priority.id && styles.priorityButtonActive,
                                    { backgroundColor: formData.priority === priority.id ? priority.color : '#F9FAFB' },
                                ]}
                                onPress={() => setFormData({ ...formData, priority: priority.id })}
                            >
                                <Text
                                    style={[
                                        styles.priorityText,
                                        formData.priority === priority.id && styles.priorityTextActive,
                                    ]}
                                >
                                    {priority.label}
                                </Text>
                                <Text
                                    style={[
                                        styles.priorityDescription,
                                        formData.priority === priority.id && styles.priorityDescriptionActive,
                                    ]}
                                >
                                    {priority.description}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Description */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Detailed Description *</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Provide detailed information about the issue, including when you noticed it, how it affects the community, and any other relevant details..."
                        value={formData.description}
                        onChangeText={(text) => setFormData({ ...formData, description: text })}
                        multiline
                        numberOfLines={4}
                    />
                </View>

                {/* Location Selection */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Issue Location *</Text>
                    <View style={styles.locationContainer}>
                        <TextInput
                            style={[styles.input, styles.locationInput]}
                            placeholder="Location will appear here"
                            value={formData.locationName}
                            editable={false}
                        />
                        <TouchableOpacity style={styles.locationButton} onPress={handleLocationSelection}>
                            <Map size={20} color="#1E40AF" />
                        </TouchableOpacity>
                    </View>

                    {formData.address && (
                        <View style={styles.addressContainer}>
                            <MapPin size={16} color="#6B7280" />
                            <Text style={styles.addressText}>{formData.address}</Text>
                        </View>
                    )}

                    <Text style={styles.locationHint}>
                        Choose your location method: use current GPS location or manually select from state/district/area
                    </Text>
                </View>

                {/* Media Upload */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Add Photos</Text>
                    <Text style={styles.mediaHint}>Photos help officials understand and resolve issues faster</Text>
                    <View style={styles.mediaContainer}>
                        <TouchableOpacity style={styles.mediaButton} onPress={takePhoto}>
                            <Camera size={24} color="#1E40AF" />
                            <Text style={styles.mediaButtonText}>Take Photo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.mediaButton} onPress={pickImage}>
                            <Upload size={24} color="#1E40AF" />
                            <Text style={styles.mediaButtonText}>Upload Photos</Text>
                        </TouchableOpacity>
                    </View>

                    {selectedImages.length > 0 && (
                        <ScrollView horizontal style={styles.imagePreview} showsHorizontalScrollIndicator={false}>
                            {selectedImages.map((image, index) => (
                                <View key={index} style={styles.imageContainer}>
                                    <Image source={{ uri: image.uri }} style={styles.previewImage} />
                                    <TouchableOpacity
                                        style={styles.removeImageButton}
                                        onPress={() => removeImage(index)}
                                    >
                                        <X size={16} color="#FFFFFF" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>
                    )}
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                    style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                    onPress={submitReport}
                    disabled={loading}
                >
                    <Send size={20} color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>
                        {loading ? 'Submitting...' : 'Submit Report'}
                    </Text>
                </TouchableOpacity>

                <View style={styles.infoSection}>
                    <Text style={styles.infoTitle}>What happens next?</Text>
                    <Text style={styles.infoText}>
                        • Your report will be automatically routed to the area administrator{'\n'}
                        • The area admin will review and assign to the appropriate department{'\n'}
                        • Department will create tenders for contractors if needed{'\n'}
                        • You'll receive updates throughout the resolution process{'\n'}
                        • You earn points for contributing to your community
                    </Text>
                </View>
            </View>

            {/* Location Selection Modal */}
            <Modal
                visible={showLocationModal}
                animationType="slide"
                presentationStyle="pageSheet"
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity
                            style={styles.modalCloseButton}
                            onPress={() => setShowLocationModal(false)}
                        >
                            <X size={24} color="#6B7280" />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>Select Issue Location</Text>
                        <View style={styles.modalHeaderSpacer} />
                    </View>

                    <ScrollView style={styles.modalContent}>
                        {/* Location Method Selection */}
                        <View style={styles.locationMethodSection}>
                            <Text style={styles.sectionTitle}>Choose Location Method</Text>
                            
                            <TouchableOpacity
                                style={styles.locationMethodButton}
                                onPress={useCurrentLocation}
                            >
                                <Navigation size={24} color="#10B981" />
                                <View style={styles.locationMethodContent}>
                                    <Text style={styles.locationMethodTitle}>Use Current Location</Text>
                                    <Text style={styles.locationMethodDescription}>
                                        Automatically detect your current GPS location
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            <Text style={styles.orText}>OR</Text>

                            <Text style={styles.manualLocationTitle}>Select Location Manually</Text>
                        </View>

                        {/* Manual Location Selection */}
                        <View style={styles.manualLocationSection}>
                            {/* State Selection */}
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>State *</Text>
                                {loadingLocations ? (
                                    <Text style={styles.loadingText}>Loading states...</Text>
                                ) : (
                                    <View style={styles.optionsContainer}>
                                        {states.map((state) => (
                                            <TouchableOpacity
                                                key={state.id}
                                                style={[
                                                    styles.optionButton,
                                                    formData.selectedState === state.id && styles.optionButtonActive,
                                                ]}
                                                onPress={() => {
                                                    setFormData({ 
                                                        ...formData, 
                                                        selectedState: state.id, 
                                                        selectedDistrict: '', 
                                                        selectedArea: '' 
                                                    });
                                                    loadDistricts(state.id);
                                                }}
                                            >
                                                <Text
                                                    style={[
                                                        styles.optionText,
                                                        formData.selectedState === state.id && styles.optionTextActive,
                                                    ]}
                                                >
                                                    {state.name}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </View>

                            {/* District Selection */}
                            {formData.selectedState && (
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>District *</Text>
                                    {loadingLocations ? (
                                        <Text style={styles.loadingText}>Loading districts...</Text>
                                    ) : (
                                        <View style={styles.optionsContainer}>
                                            {districts.map((district) => (
                                                <TouchableOpacity
                                                    key={district.id}
                                                    style={[
                                                        styles.optionButton,
                                                        formData.selectedDistrict === district.id && styles.optionButtonActive,
                                                    ]}
                                                    onPress={() => {
                                                        setFormData({ 
                                                            ...formData, 
                                                            selectedDistrict: district.id, 
                                                            selectedArea: '' 
                                                        });
                                                        loadAreas(district.id);
                                                    }}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.optionText,
                                                            formData.selectedDistrict === district.id && styles.optionTextActive,
                                                        ]}
                                                    >
                                                        {district.name}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            )}

                            {/* Area Selection */}
                            {formData.selectedDistrict && (
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Area *</Text>
                                    {loadingLocations ? (
                                        <Text style={styles.loadingText}>Loading areas...</Text>
                                    ) : (
                                        <View style={styles.optionsContainer}>
                                            {areas.map((area) => (
                                                <TouchableOpacity
                                                    key={area.id}
                                                    style={[
                                                        styles.optionButton,
                                                        formData.selectedArea === area.id && styles.optionButtonActive,
                                                    ]}
                                                    onPress={() => setFormData({ ...formData, selectedArea: area.id })}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.optionText,
                                                            formData.selectedArea === area.id && styles.optionTextActive,
                                                        ]}
                                                    >
                                                        {area.name} ({area.code})
                                                    </Text>
                                                    {area.description && (
                                                        <Text style={styles.optionSubtext}>
                                                            {area.description}
                                                        </Text>
                                                    )}
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            )}

                            {formData.selectedArea && (
                                <TouchableOpacity
                                    style={styles.confirmLocationButton}
                                    onPress={confirmManualLocation}
                                >
                                    <Text style={styles.confirmLocationText}>Confirm Location</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </ScrollView>
                </View>
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 16,
        color: '#6B7280',
    },
    form: {
        padding: 20,
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        color: '#111827',
    },
    textArea: {
        height: 120,
        textAlignVertical: 'top',
    },
    categoryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    categoryButton: {
        flex: 1,
        minWidth: '45%',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 2,
        borderRadius: 12,
        borderColor: '#E5E7EB',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        gap: 8,
    },
    categoryButtonActive: {
        backgroundColor: '#F0F9FF',
    },
    categoryIcon: {
        fontSize: 24,
    },
    categoryText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#6B7280',
        textAlign: 'center',
    },
    priorityContainer: {
        gap: 12,
    },
    priorityButton: {
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    priorityButtonActive: {
        borderColor: 'transparent',
    },
    priorityText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6B7280',
        marginBottom: 4,
    },
    priorityTextActive: {
        color: '#FFFFFF',
    },
    priorityDescription: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    priorityDescriptionActive: {
        color: '#FFFFFF',
        opacity: 0.9,
    },
    locationContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    locationInput: {
        flex: 1,
        backgroundColor: '#F9FAFB',
        color: '#6B7280',
    },
    locationButton: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#F0F9FF',
        borderRadius: 8,
        gap: 8,
    },
    addressText: {
        fontSize: 12,
        color: '#1E40AF',
        flex: 1,
    },
    locationHint: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 8,
        fontStyle: 'italic',
    },
    mediaHint: {
        fontSize: 12,
        color: '#6B7280',
        marginBottom: 12,
    },
    mediaContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    mediaButton: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: '#1E40AF',
        borderStyle: 'dashed',
        borderRadius: 12,
        paddingVertical: 20,
        alignItems: 'center',
        gap: 8,
    },
    mediaButtonText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#1E40AF',
    },
    imagePreview: {
        marginTop: 12,
    },
    imageContainer: {
        position: 'relative',
        marginRight: 12,
    },
    previewImage: {
        width: 80,
        height: 80,
        borderRadius: 8,
    },
    removeImageButton: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: '#EF4444',
        borderRadius: 12,
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    submitButton: {
        backgroundColor: '#1E40AF',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        gap: 8,
        marginTop: 20,
        shadowColor: '#1E40AF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    infoSection: {
        backgroundColor: '#F0F9FF',
        padding: 16,
        borderRadius: 12,
        marginTop: 20,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    infoTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1E40AF',
        marginBottom: 8,
    },
    infoText: {
        fontSize: 12,
        color: '#1E40AF',
        lineHeight: 18,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    modalCloseButton: {
        padding: 4,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
    modalHeaderSpacer: {
        width: 32,
    },
    modalContent: {
        flex: 1,
        padding: 20,
    },
    locationMethodSection: {
        marginBottom: 30,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 16,
    },
    locationMethodButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F0FDF4',
        padding: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#BBF7D0',
        gap: 12,
        marginBottom: 16,
    },
    locationMethodContent: {
        flex: 1,
    },
    locationMethodTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 4,
    },
    locationMethodDescription: {
        fontSize: 14,
        color: '#6B7280',
    },
    orText: {
        textAlign: 'center',
        fontSize: 14,
        color: '#9CA3AF',
        fontWeight: '600',
        marginVertical: 16,
    },
    manualLocationTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 16,
    },
    manualLocationSection: {
        gap: 16,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 8,
    },
    loadingText: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        padding: 16,
    },
    optionsContainer: {
        gap: 8,
        maxHeight: 200,
    },
    optionButton: {
        padding: 12,
        borderWidth: 2,
        borderRadius: 12,
        borderColor: '#E5E7EB',
        backgroundColor: '#F9FAFB',
    },
    optionButtonActive: {
        backgroundColor: '#F0F9FF',
        borderColor: '#1E40AF',
    },
    optionText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
        marginBottom: 2,
    },
    optionTextActive: {
        color: '#1E40AF',
    },
    optionSubtext: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    confirmLocationButton: {
        backgroundColor: '#1E40AF',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 20,
    },
    confirmLocationText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
});