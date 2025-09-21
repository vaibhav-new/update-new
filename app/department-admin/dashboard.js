import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, RefreshControl, Alert, Modal, TextInput, Image } from 'react-native';
import { 
  TriangleAlert as AlertTriangle, FileText, Users, Clock, CircleCheck as CheckCircle, 
  TrendingUp, Send, X, Camera, Upload, MapPin, User, Building, Hammer
} from 'lucide-react-native';
import { 
  getDepartmentAdminDashboard, 
  getIssuesByWorkflowStage,
  createTender,
  assignTenderToContractor,
  getWorkProgress,
  updateIssue,
  subscribeToIssueUpdates,
  subscribeToTenderUpdates,
  getCurrentUser,
  getUserProfile
} from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { uploadMultipleImages } from '../../lib/cloudinary';

const { width } = Dimensions.get('window');

export default function DepartmentAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    issues: [],
    tenders: [],
    contractors: [],
    departmentId: null
  });
  const [stats, setStats] = useState({
    assignedIssues: 0,
    activeTenders: 0,
    activeContractors: 0,
    completedProjects: 0,
    avgCompletionTime: '0 days'
  });
  const [showTenderModal, setShowTenderModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [tenderData, setTenderData] = useState({
    title: '',
    description: '',
    estimatedBudgetMin: '',
    estimatedBudgetMax: '',
    deadlineDate: '',
    requirements: ''
  });
  const [workProgressData, setWorkProgressData] = useState({
    title: '',
    description: '',
    images: [],
    status: 'completed'
  });
  const [creating, setCreating] = useState(false);
  const [submittingProgress, setSubmittingProgress] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);

  useEffect(() => {
    loadDashboardData();
    
    // Set up real-time subscriptions
    const issueSubscription = subscribeToIssueUpdates(() => {
      loadDashboardData();
    });

    const tenderSubscription = subscribeToTenderUpdates(() => {
      loadDashboardData();
    });

    return () => {
      issueSubscription.unsubscribe();
      tenderSubscription.unsubscribe();
    };
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await getDepartmentAdminDashboard();
      if (error) throw error;

      setDashboardData(data);

      // Calculate stats
      const issues = data.issues || [];
      const tenders = data.tenders || [];
      const contractors = data.contractors || [];

      const assignedIssues = issues.filter(i => i.workflow_stage === 'department_assigned').length;
      const activeTenders = tenders.filter(t => t.status === 'available').length;
      const activeContractors = contractors.length;
      const completedProjects = tenders.filter(t => t.status === 'completed').length;

      setStats({
        assignedIssues,
        activeTenders,
        activeContractors,
        completedProjects,
        avgCompletionTime: calculateAvgCompletionTime(tenders)
      });

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      Alert.alert('Error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const calculateAvgCompletionTime = (tenders) => {
    const completedTenders = tenders.filter(t => t.status === 'completed' && t.awarded_at);
    if (completedTenders.length === 0) return '0 days';

    const totalDays = completedTenders.reduce((sum, tender) => {
      const started = new Date(tender.awarded_at);
      const completed = new Date(tender.completion_date || tender.updated_at);
      return sum + Math.ceil((completed - started) / (1000 * 60 * 60 * 24));
    }, 0);

    return `${Math.round(totalDays / completedTenders.length)} days`;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleCreateTender = (issue) => {
    setSelectedIssue(issue);
    setTenderData({
      title: `Tender for: ${issue.title}`,
      description: `${issue.description}\n\nLocation: ${issue.location_name || issue.address}`,
      estimatedBudgetMin: '',
      estimatedBudgetMax: '',
      deadlineDate: '',
      requirements: ''
    });
    setShowTenderModal(true);
  };

  const submitTender = async () => {
    if (!tenderData.title || !tenderData.description || !tenderData.deadlineDate) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setCreating(true);

      const tender = {
        title: tenderData.title,
        description: tenderData.description,
        category: selectedIssue.category,
        location: selectedIssue.location_name || selectedIssue.address,
        area: selectedIssue.area,
        ward: selectedIssue.ward,
        estimated_budget_min: parseFloat(tenderData.estimatedBudgetMin) || 0,
        estimated_budget_max: parseFloat(tenderData.estimatedBudgetMax) || 0,
        deadline_date: tenderData.deadlineDate,
        submission_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        priority: selectedIssue.priority,
        requirements: tenderData.requirements.split('\n').filter(r => r.trim()),
        status: 'available',
        source_issue_id: selectedIssue.id,
        department_id: dashboardData.departmentId,
        metadata: {
          source_issue_id: selectedIssue.id,
          created_by_department: dashboardData.departmentId
        }
      };

      const { error } = await createTender(tender);
      if (error) throw error;

      // Update issue workflow stage
      const { error: updateError } = await updateIssue(selectedIssue.id, {
        workflow_stage: 'contractor_assigned',
        status: 'in_progress'
      });

      if (updateError) console.error('Error updating issue workflow:', updateError);

      Alert.alert(
        'Success',
        'Tender has been created successfully and is now available for contractors to bid',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowTenderModal(false);
              setSelectedIssue(null);
              loadDashboardData();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error creating tender:', error);
      Alert.alert('Error', 'Failed to create tender: ' + error.message);
    } finally {
      setCreating(false);
    }
  };

  const handleWorkCompleted = (assignment) => {
    setSelectedAssignment(assignment);
    setWorkProgressData({
      title: 'Work Completion Report',
      description: '',
      images: [],
      status: 'completed'
    });
    setSelectedImages([]);
    setShowProgressModal(true);
  };

  const pickImages = async () => {
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

  const submitWorkCompletion = async () => {
    if (!workProgressData.description) {
      Alert.alert('Error', 'Please provide completion details');
      return;
    }

    try {
      setSubmittingProgress(true);

      // Upload images if any
      let imageUrls = [];
      if (selectedImages.length > 0) {
        const imageUris = selectedImages.map(img => img.uri);
        const uploadResult = await uploadMultipleImages(imageUris);
        
        if (uploadResult.successful.length > 0) {
          imageUrls = uploadResult.successful.map(result => result.url);
        }
      }

      // Update issue status to resolved
      const { error: updateError } = await updateIssue(selectedAssignment.issue_id, {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        final_resolution_notes: workProgressData.description,
        workflow_stage: 'resolved'
      });

      if (updateError) throw updateError;

      Alert.alert(
        'Success',
        'Work completion has been submitted and issue marked as resolved',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowProgressModal(false);
              setSelectedAssignment(null);
              loadDashboardData();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error submitting work completion:', error);
      Alert.alert('Error', 'Failed to submit work completion: ' + error.message);
    } finally {
      setSubmittingProgress(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: '#F59E0B',
      acknowledged: '#3B82F6',
      in_progress: '#1E40AF',
      resolved: '#10B981',
    };
    return colors[status] || '#6B7280';
  };

  const getCategoryColor = (category) => {
    const colors = {
      roads: '#EF4444',
      utilities: '#F59E0B',
      environment: '#10B981',
      safety: '#8B5CF6',
      parks: '#06B6D4',
    };
    return colors[category] || '#6B7280';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Activity size={32} color="#1E40AF" />
        <Text style={styles.loadingText}>Loading department dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Department Dashboard</Text>
        <Text style={styles.subtitle}>Manage assigned issues and coordinate with contractors</Text>
      </View>

      {/* Key Metrics */}
      <View style={styles.metricsSection}>
        <Text style={styles.sectionTitle}>Department Overview</Text>
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <AlertTriangle size={24} color="#EF4444" />
            <Text style={styles.metricNumber}>{stats.assignedIssues}</Text>
            <Text style={styles.metricLabel}>Assigned Issues</Text>
          </View>

          <View style={styles.metricCard}>
            <FileText size={24} color="#F59E0B" />
            <Text style={styles.metricNumber}>{stats.activeTenders}</Text>
            <Text style={styles.metricLabel}>Active Tenders</Text>
          </View>

          <View style={styles.metricCard}>
            <Users size={24} color="#8B5CF6" />
            <Text style={styles.metricNumber}>{stats.activeContractors}</Text>
            <Text style={styles.metricLabel}>Contractors</Text>
          </View>

          <View style={styles.metricCard}>
            <CheckCircle size={24} color="#10B981" />
            <Text style={styles.metricNumber}>{stats.completedProjects}</Text>
            <Text style={styles.metricLabel}>Completed</Text>
          </View>
        </View>
      </View>

      {/* Assigned Issues */}
      <View style={styles.issuesSection}>
        <Text style={styles.sectionTitle}>Assigned Issues - Create Tenders</Text>
        <View style={styles.issuesList}>
          {dashboardData.issues
            .filter(issue => issue.workflow_stage === 'department_assigned')
            .slice(0, 5)
            .map((issue) => (
            <View key={issue.id} style={styles.issueCard}>
              {/* Issue Header */}
              <View style={styles.issueHeader}>
                <View style={styles.issueMeta}>
                  <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(issue.category) + '20' }]}>
                    <Text style={[styles.categoryText, { color: getCategoryColor(issue.category) }]}>
                      {issue.category.charAt(0).toUpperCase() + issue.category.slice(1)}
                    </Text>
                  </View>
                  <View style={[styles.priorityBadge, { backgroundColor: getStatusColor(issue.priority) }]}>
                    <Text style={styles.priorityText}>
                      {issue.priority.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.statusContainer}>
                  <Text style={[styles.statusText, { color: getStatusColor(issue.status) }]}>
                    {issue.status.replace('_', ' ').charAt(0).toUpperCase() + issue.status.replace('_', ' ').slice(1)}
                  </Text>
                </View>
              </View>

              {/* Issue Content */}
              <Text style={styles.issueTitle}>{issue.title}</Text>
              <Text style={styles.issueDescription} numberOfLines={2}>
                {issue.description}
              </Text>

              {/* Reporter and Location */}
              <View style={styles.issueDetails}>
                <View style={styles.reporterInfo}>
                  <User size={14} color="#6B7280" />
                  <Text style={styles.reporterText}>
                    Reported by {issue.profiles?.full_name || 'Anonymous'}
                  </Text>
                  <Text style={styles.reportDate}>{formatDate(issue.created_at)}</Text>
                </View>
                
                {issue.location_name && (
                  <View style={styles.locationContainer}>
                    <MapPin size={14} color="#6B7280" />
                    <Text style={styles.locationText}>{issue.location_name}</Text>
                  </View>
                )}
              </View>

              {/* Actions */}
              <View style={styles.issueActions}>
                <TouchableOpacity
                  style={styles.tenderButton}
                  onPress={() => handleCreateTender(issue)}
                >
                  <FileText size={16} color="#FFFFFF" />
                  <Text style={styles.tenderButtonText}>Create Tender</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.completeButton}
                  onPress={() => handleWorkCompleted({ issue_id: issue.id })}
                >
                  <CheckCircle size={16} color="#FFFFFF" />
                  <Text style={styles.completeButtonText}>Mark Complete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Active Tenders */}
      <View style={styles.tendersSection}>
        <Text style={styles.sectionTitle}>Active Tenders</Text>
        <View style={styles.tendersList}>
          {dashboardData.tenders
            .filter(tender => tender.status === 'available')
            .slice(0, 3)
            .map((tender) => (
            <View key={tender.id} style={styles.tenderCard}>
              <Text style={styles.tenderTitle}>{tender.title}</Text>
              <Text style={styles.tenderDescription} numberOfLines={2}>
                {tender.description}
              </Text>
              
              <View style={styles.tenderMeta}>
                <Text style={styles.tenderBudget}>
                  Budget: ${tender.estimated_budget_min} - ${tender.estimated_budget_max}
                </Text>
                <Text style={styles.tenderDeadline}>
                  Deadline: {formatDate(tender.deadline_date)}
                </Text>
                <Text style={styles.tenderBids}>
                  {tender.bids?.length || 0} bids received
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Performance Metrics */}
      <View style={styles.performanceSection}>
        <Text style={styles.sectionTitle}>Department Performance</Text>
        <View style={styles.performanceGrid}>
          <View style={styles.performanceCard}>
            <TrendingUp size={20} color="#10B981" />
            <Text style={styles.performanceValue}>{stats.avgCompletionTime}</Text>
            <Text style={styles.performanceLabel}>Avg Completion Time</Text>
          </View>
          <View style={styles.performanceCard}>
            <Hammer size={20} color="#8B5CF6" />
            <Text style={styles.performanceValue}>94%</Text>
            <Text style={styles.performanceLabel}>Success Rate</Text>
          </View>
        </View>
      </View>

      {/* Create Tender Modal */}
      <Modal visible={showTenderModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Tender</Text>
              <TouchableOpacity onPress={() => setShowTenderModal(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tender Title *</Text>
                <TextInput
                  style={styles.textInput}
                  value={tenderData.title}
                  onChangeText={(text) => setTenderData({...tenderData, title: text})}
                  placeholder="Enter tender title"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description *</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={tenderData.description}
                  onChangeText={(text) => setTenderData({...tenderData, description: text})}
                  placeholder="Detailed tender description"
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputGroupHalf}>
                  <Text style={styles.inputLabel}>Min Budget ($)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={tenderData.estimatedBudgetMin}
                    onChangeText={(text) => setTenderData({...tenderData, estimatedBudgetMin: text})}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.inputGroupHalf}>
                  <Text style={styles.inputLabel}>Max Budget ($)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={tenderData.estimatedBudgetMax}
                    onChangeText={(text) => setTenderData({...tenderData, estimatedBudgetMax: text})}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Deadline Date *</Text>
                <TextInput
                  style={styles.textInput}
                  value={tenderData.deadlineDate}
                  onChangeText={(text) => setTenderData({...tenderData, deadlineDate: text})}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Requirements</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={tenderData.requirements}
                  onChangeText={(text) => setTenderData({...tenderData, requirements: text})}
                  placeholder="List requirements (one per line)"
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowTenderModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitButton, creating && styles.modalSubmitButtonDisabled]}
                onPress={submitTender}
                disabled={creating}
              >
                <Send size={16} color="#FFFFFF" />
                <Text style={styles.modalSubmitText}>
                  {creating ? 'Creating...' : 'Create Tender'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Work Completion Modal */}
      <Modal visible={showProgressModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Submit Work Completion</Text>
              <TouchableOpacity onPress={() => setShowProgressModal(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Completion Details *</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={workProgressData.description}
                  onChangeText={(text) => setWorkProgressData({...workProgressData, description: text})}
                  placeholder="Describe the completed work, materials used, and final results..."
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Photo Upload */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Completion Photos</Text>
                <Text style={styles.mediaHint}>Upload photos showing the completed work</Text>
                <View style={styles.mediaContainer}>
                  <TouchableOpacity style={styles.mediaButton} onPress={takePhoto}>
                    <Camera size={20} color="#1E40AF" />
                    <Text style={styles.mediaButtonText}>Take Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.mediaButton} onPress={pickImages}>
                    <Upload size={20} color="#1E40AF" />
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
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowProgressModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitButton, submittingProgress && styles.modalSubmitButtonDisabled]}
                onPress={submitWorkCompletion}
                disabled={submittingProgress}
              >
                <CheckCircle size={16} color="#FFFFFF" />
                <Text style={styles.modalSubmitText}>
                  {submittingProgress ? 'Submitting...' : 'Mark Complete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
  metricsSection: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: (width - 80) / 2,
    backgroundColor: '#F9FAFB',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  metricNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    textAlign: 'center',
  },
  issuesSection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  issuesList: {
    gap: 16,
  },
  issueCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  issueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  issueMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  issueTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  issueDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  issueDetails: {
    gap: 6,
    marginBottom: 12,
  },
  reporterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reporterText: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
  },
  reportDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationText: {
    fontSize: 12,
    color: '#6B7280',
  },
  issueActions: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
  },
  tenderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tenderButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  completeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  completeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  tendersSection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  tendersList: {
    gap: 12,
  },
  tenderCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tenderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  tenderDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  tenderMeta: {
    gap: 4,
  },
  tenderBudget: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  tenderDeadline: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '500',
  },
  tenderBids: {
    fontSize: 12,
    color: '#6B7280',
  },
  performanceSection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  performanceGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  performanceCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  performanceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  performanceLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  modalForm: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroupHalf: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
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
    backgroundColor: '#F0F9FF',
    borderWidth: 2,
    borderColor: '#1E40AF',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
  },
  mediaButtonText: {
    fontSize: 12,
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
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  modalSubmitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1E40AF',
    gap: 6,
  },
  modalSubmitButtonDisabled: {
    opacity: 0.6,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});