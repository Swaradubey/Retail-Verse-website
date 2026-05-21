const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const { getAdminAnalytics } = require('../controllers/adminAnalyticsController');

async function runScenario(scenarioName, userFields, explicitQueryClientId) {
  console.log(`\n========================================`);
  console.log(`SCENARIO: ${scenarioName}`);
  console.log(`========================================`);

  const mockUser = {
    _id: new mongoose.Types.ObjectId(),
    email: 'test@ecosystem.com',
    role: userFields.role,
    clientId: userFields.clientId,
    assignedClient: userFields.assignedClient,
    linkedClientId: userFields.linkedClientId
  };

  const req = {
    user: mockUser,
    query: explicitQueryClientId ? { clientId: explicitQueryClientId } : {},
    body: {},
    headers: {}
  };

  const res = {
    statusCode: 200,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(responsePayload) {
      console.log(`Response Status: ${this.statusCode}`);
      console.log('Response Success:', responsePayload.success);
      if (responsePayload.success && responsePayload.data) {
        const data = responsePayload.data;
        console.log('Scope:', data.analyticsScope);
        console.log('Summary:', JSON.stringify(data.summary, null, 2));
        console.log('Revenue Flow Points count:', data.revenueFlow ? data.revenueFlow.length : 0);
        console.log('Top Categories count:', data.topCategories ? data.topCategories.length : 0);
        console.log('Top Products:', JSON.stringify(data.topProducts, null, 2));
      } else {
        console.error('Error message:', responsePayload.message);
      }
    }
  };

  await getAdminAnalytics(req, res);
}

async function testAnalytics() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // 1. Test Admin Role (Global Access)
    await runScenario('Admin Role (Global)', { role: 'admin' });

    // 2. Test Client Role with valid client ID (Data Isolation)
    const validClientId = '69fc8d0246025e33faefa771';
    await runScenario('Client Role (Isolated)', { role: 'client', clientId: validClientId });

    // 3. Test Client Role trying to override clientId in query parameter (Query Manipulation Prevention)
    await runScenario('Client Role (Attempting Query Manipulation)', { role: 'client', clientId: validClientId }, '69fc8d0246025e33faefa772');

    // 4. Test Client Role with no data / non-existent client ID (Zero-State handling)
    const emptyClientId = new mongoose.Types.ObjectId().toString();
    await runScenario('Client Role (Zero-State / Empty)', { role: 'client', clientId: emptyClientId });

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (err) {
    console.error('Test execution error:', err);
    try {
      await mongoose.disconnect();
    } catch (_) {}
  }
}

testAnalytics();

