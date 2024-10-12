import React, { useState, useEffect } from 'react';
import { View, FlatList, Text, PermissionsAndroid, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';
import BackgroundJob from 'react-native-background-job';

const App = () => {
  const [expenses, setExpenses] = useState([]);
  const [view, setView] = useState('home');
  const [filterType, setFilterType] = useState(null);
  const [totalAmount, setTotalAmount] = useState(0);
  const [lastCheckedTime, setLastCheckedTime] = useState(Date.now());

  const months = [
    { label: 'January 2024', value: 0 },
    { label: 'February 2024', value: 1 },
    { label: 'March 2024', value: 2 },
    { label: 'April 2024', value: 3 },
    { label: 'May 2024', value: 4 },
    { label: 'June 2024', value: 5 },
    { label: 'July 2024', value: 6 },
    { label: 'August 2024', value: 7 },
    { label: 'September 2024', value: 8 },
    { label: 'October 2024', value: 9 },
    { label: 'November 2024', value: 10 },
    { label: 'December 2024', value: 11 },
    { label: 'All Transactions', value: 'all' },
  ];

  useEffect(() => {
    BackgroundJob.register({
      jobKey: 'checkNewSms',
      job: () => checkNewSms()
    });

    BackgroundJob.schedule({
      jobKey: 'checkNewSms',
      period: 15000,
      allowExecutionInForeground: true,
    });

    return () => {
      BackgroundJob.cancel({ jobKey: 'checkNewSms' });
    };
  }, []);

  const requestSmsPermission = async () => {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        {
          title: "SMS Permission",
          message: "Expensly needs access to your SMS to read transaction messages.",
          buttonNeutral: "Ask Me Later",
          buttonNegative: "Cancel",
          buttonPositive: "OK"
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn(err);
      return false;
    }
  };

  const checkNewSms = async () => {
    const permissionGranted = await requestSmsPermission();

    if (!permissionGranted) {
      return;
    }

    const now = Date.now();

    SmsAndroid.list(
      JSON.stringify({
        box: 'inbox',
        minDate: lastCheckedTime,
        maxDate: now,
      }),
      (fail) => {
        console.log("Failed to check new SMS: " + fail);
      },
      (count, smsList) => {
        if (count > 0) {
          const messages = JSON.parse(smsList);
          const newTransactions = parseTransactions(messages);
          if (newTransactions.length > 0) {
            setExpenses(prevExpenses => [...newTransactions, ...prevExpenses]);
            updateTotalAmount(newTransactions);
          }
        }
        setLastCheckedTime(now);
      }
    );
  };

  const parseTransactions = (messages) => {
    return messages.filter(msg =>
      (filterType === 'debits' && (msg.body.includes('debited') || msg.body.includes('spent'))) ||
      (filterType === 'credits' && msg.body.includes('credited'))
    ).map(msg => {
      let amount, fromTo, date;

      if (msg.body.includes('credited')) {
        const creditMatch = msg.body.match(/credited by Rs\.(\d+(?:\.\d{1,2})?) on (\d{2}\w{3}\d{2}) transfer from ([A-Za-z\s]+) Ref No/i);
        if (creditMatch) {
          amount = parseFloat(creditMatch[1]);
          date = creditMatch[2];
          fromTo = creditMatch[3].trim();
        }
      } else {
        const debitMatch = msg.body.match(/debited by (\d+(?:\.\d{1,2})?) on date (\d{2}\w{3}\d{2}) trf to ([A-Za-z\s]+) Ref/i);
        if (debitMatch) {
          amount = parseFloat(debitMatch[1]);
          date = debitMatch[2];
          fromTo = debitMatch[3].trim();
        }
      }

      return {
        amount: amount ? amount.toFixed(2) : 'N/A',
        fromTo: fromTo || 'N/A',
        date: date || new Date(msg.date).toLocaleDateString(),
        sender: msg.address,
      };
    });
  };

  const updateTotalAmount = (newTransactions) => {
    const newTotal = newTransactions.reduce((total, transaction) => {
      const amount = parseFloat(transaction.amount);
      return total + (filterType === 'credits' ? amount : -amount);
    }, 0);

    setTotalAmount(prevTotal => prevTotal + newTotal);
  };

  const fetchExpenses = async (month) => {
    const permissionGranted = await requestSmsPermission();

    if (!permissionGranted) {
      return;
    }

    const now = new Date();
    const minDate = month !== 'all' ? new Date(2024, month, 1).getTime() : new Date(2024, 0, 1).getTime();
    const maxDate = month !== 'all' ? new Date(2024, month + 1, 0).getTime() : now.getTime();

    SmsAndroid.list(
      JSON.stringify({
        box: 'inbox',
        minDate: minDate,
        maxDate: maxDate,
      }),
      (fail) => {
        console.log("Failed with this error: " + fail);
      },
      (count, smsList) => {
        const messages = JSON.parse(smsList);
        const parsedExpenses = parseTransactions(messages);

        if (parsedExpenses.length === 0) {
          setExpenses([{ noTransactions: true }]);
        } else {
          setExpenses(parsedExpenses);
        }

        const total = parsedExpenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
        setTotalAmount(filterType === 'credits' ? total : -total);
        setView('transactions');
        setLastCheckedTime(maxDate);
      }
    );
  };

  const renderMonthSelection = () => (
    <View style={styles.container}>
      <Text style={styles.headerText}>Select a Month</Text>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent}>
        {months.map((month, index) => (
          <TouchableOpacity
            key={index}
            style={styles.monthButton}
            onPress={() => fetchExpenses(month.value)}
          >
            <Text style={styles.monthButtonText}>{month.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <TouchableOpacity style={styles.backButton} onPress={() => setView('home')}>
          <Text style={styles.backButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTransactions = () => (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => setView('months')}>
        <Text style={styles.backButtonText}>Back to Month Selection</Text>
      </TouchableOpacity>

      <View style={styles.totalAmountContainer}>
        <Text style={styles.totalAmountText}>
          Total {filterType === 'credits' ? 'Received' : 'Spent'}: ₹{Math.abs(totalAmount).toFixed(2)}
        </Text>
      </View>

      {expenses.length === 1 && expenses[0].noTransactions ? (
        <Text style={styles.noTransactionText}>No transactions made in this month</Text>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardText}>Date: {item.date}</Text>
              <Text style={styles.cardText}>Amount: ₹{item.amount}</Text>
              <Text style={styles.cardText}>
                {filterType === 'credits' ? 'From' : 'To'}: {item.fromTo}
              </Text>
              <Text style={styles.cardText}>Bank: {item.sender}</Text>
            </View>
          )}
          contentContainerStyle={styles.flatList}
        />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {view === 'home' ? (
        <View style={styles.homeButtonContainer}>
          <TouchableOpacity style={styles.button} onPress={() => { setFilterType('credits'); setView('months'); }}>
            <Text style={styles.buttonText}>View Credits</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => { setFilterType('debits'); setView('months'); }}>
            <Text style={styles.buttonText}>View Debits</Text>
          </TouchableOpacity>
        </View>
      ) : view === 'months' ? (
        renderMonthSelection()
      ) : (
        renderTransactions()
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f4f9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  homeButtonContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%'
  },
  button: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 25,
    marginVertical: 10,
    width: '80%',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  backButton: {
    backgroundColor: '#ff6347',
    padding: 12,
    borderRadius: 25,
    marginVertical: 10,
    width: '60%',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  monthButton: {
    backgroundColor: '#87CEEB',
    padding: 12,
    borderRadius: 20,
    marginVertical: 8,
    width: '100%',
    alignItems: 'center',
  },
  monthButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 15,
    marginVertical: 8,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 5,
    width: '100%',
  },
  cardText: {
    fontSize: 16,
    color: '#333',
    marginVertical: 3,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  noTransactionText: {
    fontSize: 18,
    color: '#FF6347',
    fontWeight: 'bold',
    marginTop: 20,
  },
  scrollView: {
    width: '100%',
    marginBottom: 60,
  },
  scrollViewContent: {
    paddingBottom: 20,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    width: '100%',
    alignItems: 'center',
  },
  flatListContent: {
    paddingBottom: 20,
  },
  totalAmountContainer: {
    backgroundColor: '#4CAF50',
    padding: 10,
    borderRadius: 10,
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
  },
  totalAmountText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default App;