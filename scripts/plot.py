# libraries & dataset
import seaborn as sns
import matplotlib.pyplot as plt
import pandas as pd
  
sns.set_theme(style="darkgrid")
df = pd.read_csv('foo1.csv')
 
# Make default density plot
# sns.kdeplot(df['sourcedBytes'])
# sns.kdeplot(df['singleBytes'])
# sns.kdeplot(df['sourcedLines'])
# sns.kdeplot(df['singleLines'])

# Make histogram
# sns.histplot(data=df, x="singleLines", kde=True, color="skyblue", label="singleLines", bins=20)
# sns.histplot(data=df, x="sourcedLines", kde=True, color="red", label="sourcedLines")
sns.histplot(data=df, x="sourcedBytes", kde=True, color="olive", label="sourcedBytes", bins=20)
# sns.histplot(data=df, x="singleBytes", kde=True, color="gold", label="singleBytes")
# plt.legend()

plt.show()
