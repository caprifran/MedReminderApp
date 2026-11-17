import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity, ToastAndroid } from 'react-native';
import { Text, Button, Modal, TextInput, useTheme, IconButton, SegmentedButtons, Switch, Checkbox, ProgressBar } from 'react-native-paper';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { useMedicationStore } from '../store/useMedicationStore';
import { FrequencyType, CreateMedicationDTO } from '../models';
import { FullScreenLoader } from '../components/animations/FullScreenLoader';

const COLORS = ['#3F51B5', '#4CAF50', '#F44336', '#FF9800', '#9C27B0', '#00BCD4', '#E91E63', '#607D8B'];

interface MedicationWizardModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export const MedicationWizardModal: React.FC<MedicationWizardModalProps> = ({ visible, onDismiss }) => {
  const theme = useTheme();
  const { addMedicationWithTreatment } = useMedicationStore();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // Pickers state (iOS mostly)
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [notes, setNotes] = useState('');
  
  const [dose, setDose] = useState('');
  const [unit, setUnit] = useState('mg');
  const [foodInstruction, setFoodInstruction] = useState<'none' | 'fasting' | 'with_food'>('none');

  const [frequencyType, setFrequencyType] = useState<FrequencyType>('daily');
  const [intervalHours, setIntervalHours] = useState('8');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // L a V
  const [startDate, setStartDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [startTime, setStartTime] = useState('08:00');
  const [endDate, setEndDate] = useState('');
  const [isIndefinite, setIsIndefinite] = useState(true);

  // Reset form when modal becomes visible
  useEffect(() => {
    if (visible) {
      resetForm();
    }
  }, [visible]);

  const resetForm = () => {
    setCurrentStep(1);
    setName('');
    setColor(COLORS[0]);
    setNotes('');
    setDose('');
    setUnit('mg');
    setFoodInstruction('none');
    setFrequencyType('daily');
    setIntervalHours('8');
    setSelectedDays([1,2,3,4,5]);
    setStartDate(dayjs().format('YYYY-MM-DD'));
    setStartTime('08:00');
    setEndDate('');
    setIsIndefinite(true);
  };

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter(d => d !== day));
    } else {
      setSelectedDays([...selectedDays, day].sort());
    }
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!name.trim()) {
        Alert.alert('Error', 'El nombre de la medicación es obligatorio');
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      const parsedDose = parseFloat(dose.replace(',', '.'));
      if (!dose.trim() || isNaN(parsedDose) || parsedDose <= 0) {
        Alert.alert('Error', 'La dosis debe ser un número positivo válido');
        return;
      }
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSave = async () => {
    try {
      const daysOfWeek = frequencyType === 'specific_days' ? selectedDays : null;
      let intervalParsed = parseInt(intervalHours, 10);
      
      if (frequencyType === 'interval' || frequencyType === 'specific_days') {
        if (isNaN(intervalParsed) || intervalParsed <= 0) {
          Alert.alert('Error', 'El intervalo en horas debe ser un número entero positivo');
          return;
        }
      } else {
        intervalParsed = 8;
      }

      const dto: CreateMedicationDTO = {
        name,
        dose,
        unit,
        color,
        notes: notes.trim() || undefined,
        foodInstruction: foodInstruction === 'none' ? undefined : foodInstruction,
        frequencyType,
        intervalHours: (frequencyType === 'interval' || frequencyType === 'specific_days') ? intervalParsed : null,
        daysOfWeek,
        startDate,
        startTime,
        endDate: isIndefinite ? null : endDate,
        isIndefinite
      };

      setIsSaving(true);
      await addMedicationWithTreatment(dto);
      
      // Pequeño delay para permitir que la animación se renderice y brinde feedback visual
      await new Promise(resolve => setTimeout(resolve, 600));
      
      setIsSaving(false);

      ToastAndroid.show('Medicación guardada y alarmas programadas', ToastAndroid.LONG);
      onDismiss();
    } catch (error) {
      setIsSaving(false);
      console.error(error);
      ToastAndroid.show('Error al guardar la medicación', ToastAndroid.LONG);
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text variant="headlineSmall" style={styles.stepTitle}>Identificación</Text>
      
      <TextInput
        label="Nombre del Medicamento"
        value={name}
        onChangeText={setName}
        mode="outlined"
        style={styles.input}
        autoFocus
      />
      
      <Text variant="titleMedium" style={styles.sectionLabel}>Color Identificador</Text>
      <View style={styles.colorRow}>
        {COLORS.map(c => (
          <IconButton
            key={c}
            icon={color === c ? 'check-circle' : 'circle'}
            iconColor={c}
            size={32}
            onPress={() => setColor(c)}
            style={{ margin: 2 }}
          />
        ))}
      </View>
      
      <TextInput
        label="Notas o indicaciones adicionales (Opcional)"
        value={notes}
        onChangeText={setNotes}
        mode="outlined"
        multiline
        numberOfLines={3}
        style={styles.input}
      />
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text variant="headlineSmall" style={styles.stepTitle}>Dosificación</Text>
      
      <TextInput
        label="Dosis (Ej: 500, 1)"
        value={dose}
        onChangeText={setDose}
        mode="outlined"
        keyboardType="numeric"
        style={styles.input}
        autoFocus
      />
      
      <Text variant="titleMedium" style={styles.sectionLabel}>Unidad de medida</Text>
      <SegmentedButtons
        value={unit}
        onValueChange={setUnit}
        buttons={[
          { value: 'mg', label: 'mg' },
          { value: 'ml', label: 'ml' },
          { value: 'g', label: 'g' },
          { value: 'comp', label: 'comp' },
        ]}
        style={styles.segmentedButtons}
      />

      <Text variant="titleMedium" style={styles.sectionLabel}>Condición de toma (Comida)</Text>
      <SegmentedButtons
        value={foodInstruction}
        onValueChange={(val) => setFoodInstruction(val as 'none' | 'fasting' | 'with_food')}
        buttons={[
          { value: 'none', label: 'Cualquiera' },
          { value: 'with_food', label: 'Con comida' },
          { value: 'fasting', label: 'En ayunas' },
        ]}
        style={styles.segmentedButtons}
      />
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text variant="headlineSmall" style={styles.stepTitle}>Planificación</Text>
      
      <Text variant="titleMedium" style={styles.sectionLabel}>Frecuencia de repetición</Text>
      <SegmentedButtons
        value={frequencyType}
        onValueChange={(val) => setFrequencyType(val as FrequencyType)}
        buttons={[
          { value: 'daily', label: 'Diario' },
          { value: 'interval', label: 'Horas' },
          { value: 'specific_days', label: 'Días' },
          { value: 'alternate_days', label: 'Inter' },
        ]}
        style={styles.segmentedButtons}
      />

      {(frequencyType === 'interval' || frequencyType === 'specific_days') && (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Repetir cada (horas):</Text>
          <TextInput
            mode="outlined"
            keyboardType="numeric"
            value={intervalHours}
            onChangeText={setIntervalHours}
            style={{ width: 80 }}
          />
        </View>
      )}

      {frequencyType === 'specific_days' && (
        <View style={styles.daysSelector}>
          <Text variant="bodyMedium" style={{ fontWeight: 'bold', marginBottom: 8 }}>Selecciona los días activos:</Text>
          <View style={styles.checkboxRow}>
            {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((dayName, idx) => (
              <View key={idx} style={styles.dayCol}>
                <Text variant="labelSmall">{dayName}</Text>
                <Checkbox
                  status={selectedDays.includes(idx) ? 'checked' : 'unchecked'}
                  onPress={() => toggleDay(idx)}
                />
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Date Picker Row */}
      <Text variant="titleMedium" style={styles.sectionLabel}>Fecha y Hora de Inicio</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.pickerButton, { borderColor: theme.colors.outline, flex: 1, marginRight: 8 }]}
          onPress={() => {
            if (Platform.OS === 'android') {
              DateTimePickerAndroid.open({
                value: dayjs(startDate).toDate(),
                minimumDate: new Date(),
                mode: 'date',
                onChange: (event: DateTimePickerEvent, date?: Date) => {
                  if (event.type === 'set' && date) {
                    setStartDate(dayjs(date).format('YYYY-MM-DD'));
                  }
                },
              });
            } else {
              setShowDatePicker(true);
            }
          }}
        >
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 2 }}>Fecha Inicio</Text>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: 'bold' }}>{dayjs(startDate).format('DD/MM/YYYY')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pickerButton, { borderColor: theme.colors.outline, flex: 1 }]}
          onPress={() => {
            if (Platform.OS === 'android') {
              const [h, m] = startTime.split(':').map(Number);
              const d = new Date(); d.setHours(h, m, 0, 0);
              DateTimePickerAndroid.open({
                value: d,
                mode: 'time',
                is24Hour: true,
                onChange: (event: DateTimePickerEvent, date?: Date) => {
                  if (event.type === 'set' && date) {
                    setStartTime(dayjs(date).format('HH:mm'));
                  }
                },
              });
            } else {
              setShowTimePicker(true);
            }
          }}
        >
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 2 }}>Hora Inicio</Text>
          <Text variant="bodyLarge" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>{startTime}</Text>
        </TouchableOpacity>
      </View>

      {/* iOS only pickers (Android uses imperative API above) */}
      {Platform.OS === 'ios' && showDatePicker && (
        <DateTimePicker
          value={dayjs(startDate).toDate()}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(_: DateTimePickerEvent, date?: Date) => {
            setShowDatePicker(false);
            if (date) setStartDate(dayjs(date).format('YYYY-MM-DD'));
          }}
        />
      )}
      {Platform.OS === 'ios' && showTimePicker && (
        <DateTimePicker
          value={(() => { const [h, m] = startTime.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; })()}
          mode="time"
          is24Hour={true}
          display="default"
          onChange={(_: DateTimePickerEvent, date?: Date) => {
            setShowTimePicker(false);
            if (date) setStartTime(dayjs(date).format('HH:mm'));
          }}
        />
      )}

      <View style={[styles.row, { justifyContent: 'space-between', marginVertical: 8 }]}>
        <Text variant="bodyLarge">Tratamiento Crónico (Indefinido)</Text>
        <Switch value={isIndefinite} onValueChange={setIsIndefinite} />
      </View>

      {!isIndefinite && (
        <>
          <TouchableOpacity style={[styles.pickerButton, { borderColor: theme.colors.outline, width: '100%' }]}
          onPress={() => {
            if (Platform.OS === 'android') {
              DateTimePickerAndroid.open({
                value: endDate ? dayjs(endDate).toDate() : new Date(),
                minimumDate: dayjs(startDate).toDate(),
                mode: 'date',
                onChange: (event: DateTimePickerEvent, date?: Date) => {
                  if (event.type === 'set' && date) {
                    setEndDate(dayjs(date).format('YYYY-MM-DD'));
                  }
                },
              });
            } else {
              setShowEndDatePicker(true);
            }
          }}
        >
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 2 }}>Fecha de Fin</Text>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: 'bold' }}>
              {endDate ? dayjs(endDate).format('DD/MM/YYYY') : 'Seleccionar...'}
            </Text>
          </TouchableOpacity>
          {Platform.OS === 'ios' && showEndDatePicker && (
            <DateTimePicker
              value={endDate ? dayjs(endDate).toDate() : new Date()}
              mode="date"
              display="default"
              minimumDate={dayjs(startDate).toDate()}
              onChange={(_: DateTimePickerEvent, date?: Date) => {
                setShowEndDatePicker(false);
                if (date) setEndDate(dayjs(date).format('YYYY-MM-DD'));
              }}
            />
          )}
        </>
      )}
    </View>
  );

  return (
    <>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modalContainer, { backgroundColor: theme.colors.elevation.level3 }]}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            
            {/* Wizard Header Progress */}
            <View style={styles.wizardHeader}>
              <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
                Paso {currentStep} de 3
              </Text>
              <IconButton icon="close" size={24} onPress={onDismiss} style={styles.closeBtn} />
            </View>
            <ProgressBar progress={currentStep / 3} color={theme.colors.primary} style={styles.progressBar} />
            
            {/* Wizard Content */}
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}

            {/* Wizard Footer Navigation */}
            <View style={styles.wizardFooter}>
              <Button 
                mode="outlined" 
                onPress={handleBack} 
                disabled={currentStep === 1 || isSaving}
                style={styles.navBtn}
              >
                Atrás
              </Button>
              
              {currentStep < 3 ? (
                <Button 
                  mode="contained" 
                  onPress={handleNext}
                  style={styles.navBtn}
                >
                  Siguiente
                </Button>
              ) : (
                <Button 
                  mode="contained" 
                  onPress={handleSave}
                  loading={isSaving}
                  disabled={isSaving}
                  style={styles.navBtn}
                >
                  Guardar
                </Button>
              )}
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <FullScreenLoader visible={isSaving} message="Guardando medicamento..." />
    </>
  );
};

const styles = StyleSheet.create({
  modalContainer: { margin: 20, borderRadius: 16, maxHeight: '90%' },
  modalScroll: { padding: 24 },
  wizardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  closeBtn: { margin: 0, marginRight: -8 },
  progressBar: { height: 6, borderRadius: 3, marginBottom: 24 },
  stepContainer: { minHeight: 250 },
  stepTitle: { fontWeight: 'bold', marginBottom: 16 },
  input: { marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  rowLabel: { flex: 1, fontSize: 16 },
  sectionLabel: { fontWeight: 'bold', marginTop: 8, marginBottom: 8 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  segmentedButtons: { marginBottom: 16 },
  daysSelector: { marginBottom: 16 },
  checkboxRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center' },
  wizardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderColor: '#e0e0e0' },
  navBtn: { flex: 1, marginHorizontal: 4 },
  pickerButton: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
});
